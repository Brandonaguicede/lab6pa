var val = require('../libs/unalib');
var assert = require('assert');


describe('unalib', function(){


  describe('funcion is_valid_phone', function(){

    it('deberia devolver true para 8297-8547', function(){

      assert.equal(val.is_valid_phone('8297-8547'), true);

    });

    it('deberia devolver false para 8297p-8547', function(){

      assert.equal(val.is_valid_phone('8297p-8547'), false);

    });

  });


  describe('funcion is_valid_url_image', function(){

    it('deberia devolver true para http://image.com/image.jpg', function(){

      assert.equal(val.is_valid_url_image('http://image.com/image.jpg'), true);

    });

    it('deberia devolver true para http://image.com/image.gif', function(){

      assert.equal(val.is_valid_url_image('http://image.com/image.gif'), true);

    });
    
  });

  describe('funcion is_valid_yt_video', function(){

    it('deberia devolver true para https://www.youtube.com/watch?v=qYwlqx-JLok', function(){

      assert.equal(val.is_valid_yt_video('https://www.youtube.com/watch?v=qYwlqx-JLok'), true);

    });

  });


  describe('validacion de URLs de imagenes', function(){

    ['jpg', 'jpeg', 'gif', 'png', 'bmp', 'webp'].forEach(function(ext){
      it('acepta la extension .' + ext, function(){
        assert.equal(val.is_valid_url_image('https://example.com/foto.' + ext), true);
      });
    });

    it('acepta query string', function(){
      assert.equal(val.is_valid_url_image('https://example.com/foto.png?w=200'), true);
    });

    it('rechaza una URL que no es imagen', function(){
      assert.equal(val.is_valid_url_image('https://example.com/pagina.html'), false);
    });

    it('rechaza esquemas peligrosos (javascript:, data:)', function(){
      assert.equal(val.is_valid_url_image('javascript:alert(1)//x.png'), false);
      assert.equal(val.is_valid_url_image('data:image/png;base64,AAAA'), false);
    });

    it('rechaza URLs que intentan salirse del atributo src', function(){
      assert.equal(val.is_valid_url_image('http://a.com/x.png" onerror="alert(1)'), false);
      assert.equal(val.is_valid_url_image('http://a.com/x.png"><script>alert(1)</script>.png'), false);
    });

    it('validateMessage convierte una URL de imagen en una etiqueta <img>', function(){
      var r = JSON.parse(val.validateMessage(JSON.stringify({ nombre: 'Ana', mensaje: 'https://example.com/foto.png', color: '#112233' })));
      assert.ok(r.mensaje.indexOf('<img src="https://example.com/foto.png"') === 0);
    });

  });

  describe('validacion de URLs de videos', function(){

    it('acepta youtube.com/watch?v=', function(){
      assert.equal(val.is_valid_yt_video('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), true);
    });

    it('acepta youtu.be/', function(){
      assert.equal(val.is_valid_yt_video('https://youtu.be/dQw4w9WgXcQ'), true);
    });

    it('rechaza un id de YouTube invalido', function(){
      assert.equal(val.is_valid_yt_video('https://www.youtube.com/watch?v=corto'), false);
    });

    it('rechaza otro dominio con apariencia de YouTube', function(){
      assert.equal(val.is_valid_yt_video('https://evil.com/youtube.com/watch?v=dQw4w9WgXcQ'), false);
    });

    it('acepta videos directos mp4 y webm', function(){
      assert.equal(val.is_valid_url_video('https://example.com/clip.mp4'), true);
      assert.equal(val.is_valid_url_video('https://example.com/clip.webm'), true);
    });

    it('rechaza una URL que no es video', function(){
      assert.equal(val.is_valid_url_video('https://example.com/clip.exe'), false);
    });

    it('validateMessage inserta un reproductor iframe para YouTube', function(){
      var r = JSON.parse(val.validateMessage(JSON.stringify({ nombre: 'Ana', mensaje: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', color: '#112233' })));
      assert.ok(r.mensaje.indexOf('<iframe') === 0);
      assert.ok(r.mensaje.indexOf('https://www.youtube.com/embed/dQw4w9WgXcQ') > -1);
    });

    it('validateMessage inserta un reproductor <video> para mp4', function(){
      var r = JSON.parse(val.validateMessage(JSON.stringify({ nombre: 'Ana', mensaje: 'https://example.com/clip.mp4', color: '#112233' })));
      assert.ok(r.mensaje.indexOf('<video controls') === 0);
    });

  });

  describe('prevencion de inyeccion de scripts', function(){

    function validar(obj){
      return JSON.parse(val.validateMessage(JSON.stringify(obj)));
    }

    it('escapa <script> en el mensaje', function(){
      var r = validar({ nombre: 'x', mensaje: "<script>alert('Inyeccion de script');</script>", color: '#000000' });
      assert.ok(r.mensaje.indexOf('<script') === -1);
      assert.ok(r.mensaje.indexOf('&lt;script&gt;') === 0);
    });

    it('escapa etiquetas con manejadores de eventos', function(){
      var r = validar({ nombre: 'x', mensaje: '<img src=x onerror=alert(1)>', color: '#000000' });
      assert.ok(r.mensaje.indexOf('<') === -1);
    });

    it('escapa HTML en el nombre de usuario', function(){
      var r = validar({ nombre: '<script>alert(1)</script>', mensaje: 'hola', color: '#000000' });
      assert.ok(r.nombre.indexOf('<') === -1);
    });

    it('reemplaza un color malicioso por uno seguro', function(){
      var r = validar({ nombre: 'x', mensaje: 'hola', color: "red'><script>alert(1)</script>" });
      assert.equal(r.color, '#000000');
    });

    it('un mensaje con texto mas una URL no se interpreta como HTML', function(){
      var r = validar({ nombre: 'x', mensaje: 'mira http://a.com/x.png <script>alert(1)</script>', color: '#000000' });
      assert.ok(r.mensaje.indexOf('<') === -1);
    });

    it('un JSON invalido se devuelve escapado', function(){
      var log = console.log; console.log = function(){}; // se espera el log de error de parseo
      var r = JSON.parse(val.validateMessage('<script>alert(1)</script>'));
      console.log = log;
      assert.ok(r.mensaje.indexOf('<') === -1);
    });

    it('un mensaje vacio o no string no rompe la validacion', function(){
      assert.deepEqual(JSON.parse(val.validateMessage(undefined)), { mensaje: '' });
      assert.deepEqual(JSON.parse(val.validateMessage(42)), { mensaje: '' });
    });

  });

});
