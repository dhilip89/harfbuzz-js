var harfbuzz = (function() {
  var fontCache = {};
  
  function createFont(url, size, cb) {
    if(fontCache[url] != undefined) {
      // TODO size?
      cb(fontCache[url])
    } else {
      fetch(url)
        .then(function(res) { return res.arrayBuffer(); })
        .then(function(fontFileBuffer) {            
          var fontFileCharBuffer = new Uint8Array(fontFileBuffer);
          var fontPointer = Module._malloc(fontFileCharBuffer.length * fontFileCharBuffer.BYTES_PER_ELEMENT);
          Module.HEAPU8.set(fontFileCharBuffer, fontPointer);
          var blob = Module._hb_blob_create(fontPointer, fontFileCharBuffer.length, 1, 0, 0)
          var hbFace = Module._hb_face_create(blob, 0)
          var hbFont = Module._hb_font_create(hbFace)
          Module._hb_ot_font_set_funcs(hbFont);
          Module._hb_font_set_scale(hbFont, size, size);
          
          var otFont;
          if(global.opentype)
            otFont= opentype.parse(fontFileBuffer);
          
          cb({hb:hbFont, ot:otFont});
        });
    }
  }

  function setFontScale(font, size) {
    Module._hb_font_set_scale(font.hb, size, size);
  }

  function shapedRaw(font, text) {
    // shape text
    var textBuffer = Module._hb_buffer_create();
    var textPointer = Module.allocate(Module.intArrayFromString(text), Module.int8_t, Module.ALLOC_NORMAL)
    Module._hb_buffer_add_utf8(textBuffer, textPointer, -1, 0, -1);
    Module._hb_buffer_guess_segment_properties (textBuffer);
    Module._hb_shape(font.hb, textBuffer, 0, 0);
    
    // extract information
    var glyphCount = Module._hb_buffer_get_length (textBuffer);
    var glyphInfo = Module._hb_buffer_get_glyph_infos(textBuffer, 0);
    var glyphPos = Module._hb_buffer_get_glyph_positions(textBuffer, 0);
    
    var glyphs = [];
    for(var i=0; i<glyphCount; i++) {
      var codepoint = Module.HEAPU32[glyphInfo / 4 + i * 5 + 0]
      var mask      = Module.HEAPU32[glyphInfo / 4 + i * 5 + 1]
      var cluster   = Module.HEAPU32[glyphInfo / 4 + i * 5 + 2]
      var xAdvance  = Module.HEAP32 [glyphPos  / 4 + i * 5 + 0]
      var yAdvance  = Module.HEAP32 [glyphPos  / 4 + i * 5 + 1]
      var xOffset   = Module.HEAP32 [glyphPos  / 4 + i * 5 + 2]
      var yOffset   = Module.HEAP32 [glyphPos  / 4 + i * 5 + 3]
      // hb_font_get_glyph_name not working for some reason
      glyphs.push({codepoint:codepoint, mask:mask, cluster:cluster, xAdvance:xAdvance, yAdvance:yAdvance, xOffset:xOffset, yOffset:yOffset });
    }
    
    Module._hb_buffer_destroy(textBuffer)
    Module._free(textPointer);
    
    return glyphs;
  }

  function shaped(font, text, size, x, y) {
    if(font.ot === undefined)
      throw new "Cannot shape text without opentype library"
    
    size = size || 64;
    x = x || 0;
    y = y || 0;
    
    var shapedBuffer = shapedRaw(font, text)
    
    var paths = shapedBuffer.map(function(s) {
      var glyph = font.ot.glyphs.glyphs[s.codepoint];
      // https://lists.freedesktop.org/archives/harfbuzz/2015-December/005371.html
      var path = glyph.getPath(x + s.xOffset, y - s.yOffset, size);
      x += s.xAdvance;
      y -= s.yAdvance;
      return path;
    });
    
    return paths;
  }

  function svg(font, text, size, x, y) {
    return shaped(font, text, size, x, y).map(function(p) { return p.toSVG(); });
  }

  function commands(font, text, size, x, y) {
    return shaped(font, text, size, x, y).map(function(p) { return p.commands; });
  }
  
  return { createFont: createFont,
           setFontScale: setFontScale,
           shapedRaw: shapedRaw,
           shaped: shaped,
           svg: svg,
           commands: commands  }
})();