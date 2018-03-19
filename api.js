let harfbuzz = (function() {
  let fontCache = {};
  
  function createFont(url, size, cb) {
    if(fontCache[url] != undefined) {
      // TODO size?
      cb(fontCache[url])
    } else {
      fetch(url)
        .then(res => res.arrayBuffer())
        .then(fontFileBuffer => {            
          let fontFileCharBuffer = new Uint8Array(fontFileBuffer);
          let fontPointer = Module._malloc(fontFileCharBuffer.length * fontFileCharBuffer.BYTES_PER_ELEMENT);
          Module.HEAPU8.set(fontFileCharBuffer, fontPointer);
          let blob = Module._hb_blob_create(fontPointer, fontFileCharBuffer.length, 1, 0, 0)
          let hbFace = Module._hb_face_create(blob, 0)
          let hbFont = Module._hb_font_create(hbFace)
          Module._hb_ot_font_set_funcs(hbFont);
          Module._hb_font_set_scale(hbFont, size, size);
          
          let otFont = opentype.parse(fontFileBuffer);
          
          cb({hb:hbFont, ot:otFont});
        });
    }
  }

  function setFontScale(font, size) {
    Module._hb_font_set_scale(font.hb, size, size);
  }

  function shapedRaw(font, text) {
    // shape text
    let textBuffer = Module._hb_buffer_create();
    let textPointer = Module.allocate(Module.intArrayFromString(text), Module.int8_t, Module.ALLOC_NORMAL)
    Module._hb_buffer_add_utf8(textBuffer, textPointer, -1, 0, -1);
    Module._hb_buffer_guess_segment_properties (textBuffer);
    Module._hb_shape(font.hb, textBuffer, 0, 0);
    
    // extract information
    let glyphCount = Module._hb_buffer_get_length (textBuffer);
    let glyphInfo = Module._hb_buffer_get_glyph_infos(textBuffer, 0);
    let glyphPos = Module._hb_buffer_get_glyph_positions(textBuffer, 0);
    
    let glyphs = [];
    for(let i=0; i<glyphCount; i++) {
      let codepoint = Module.HEAPU32[glyphInfo / 4 + i * 5 + 0]
      let mask      = Module.HEAPU32[glyphInfo / 4 + i * 5 + 1]
      let cluster   = Module.HEAPU32[glyphInfo / 4 + i * 5 + 2]
      let xAdvance  = Module.HEAP32 [glyphPos  / 4 + i * 5 + 0]
      let yAdvance  = Module.HEAP32 [glyphPos  / 4 + i * 5 + 1]
      let xOffset   = Module.HEAP32 [glyphPos  / 4 + i * 5 + 2]
      let yOffset   = Module.HEAP32 [glyphPos  / 4 + i * 5 + 3]
      // hb_font_get_glyph_name not working for some reason
      glyphs.push({codepoint, mask, cluster, xAdvance, yAdvance, xOffset, yOffset });
    }
    
    Module._hb_buffer_destroy(textBuffer)
    Module._free(textPointer);
    
    return glyphs;
  }

  function shaped(font, text, size, x, y) {
    size = size || 64;
    x = x || 0;
    y = y || 0;
    
    let shapedBuffer = shapedRaw(font, text)
    
    let paths = shapedBuffer.map(s => {
      let glyph = font.ot.glyphs.glyphs[s.codepoint];
      // https://lists.freedesktop.org/archives/harfbuzz/2015-December/005371.html
      let path = glyph.getPath(x + s.xOffset, y - s.yOffset, size);
      x += s.xAdvance;
      y -= s.yAdvance;
      return path;
    });
    
    return paths;
  }

  function svg(font, text, size, x, y) {
    return shaped(font, text, size, x, y).map(p => p.toSVG());
  }

  function commands(font, text, size, x, y) {
    return shaped(font, text, size, x, y).map(p => p.commands);
  }
  
  return { createFont: createFont,
           setFontScale: setFontScale,
           shapedRaw: shapedRaw,
           shaped: shaped,
           svg: svg,
           commands: commands  }
})();