// modulo de ejemplo.

// escapa los caracteres con significado en HTML para que nunca se interpreten como codigo
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// URL http(s) sin espacios ni caracteres que permitan salirse de un atributo HTML
var URL_BODY = 'https?:\\/\\/[^\\s<>"\'`\\\\]+';

module.exports = {

    escapeHtml: escapeHtml,

    // logica que valida si un telefono esta correcto...
    is_valid_phone: function (phone) {
      // inicializacion lazy
      var isValid = false;
      // expresion regular copiada de StackOverflow
      var re = /^[+]*[(]{0,1}[0-9]{1,4}[)]{0,1}[-\s\./0-9]*$/i;

      // validacion Regex
      try {
        isValid = re.test(phone);
      } catch (e) {
        console.log(e);
      } finally {
          return isValid;
      }
      // fin del try-catch block
    },

    // el mensaje completo debe ser UNA url http(s) que termine en una extension de imagen
    is_valid_url_image: function (url) {

      // inicializacion lazy
      var isValid = false;
      var re = new RegExp('^' + URL_BODY + '\\.(?:jpg|jpeg|gif|png|bmp|webp)(?:\\?[^\\s<>"\'`\\\\]*)?$', 'i');

      // validacion Regex
      try {
        isValid = typeof url === 'string' && re.test(url);
      } catch (e) {
        console.log(e);
      } finally {
          return isValid;
      }
      // fin del try-catch block
    },

    // el mensaje completo debe ser UNA url http(s) que termine en una extension de video
    is_valid_url_video: function (url) {

      var isValid = false;
      var re = new RegExp('^' + URL_BODY + '\\.(?:mp4|webm|ogg)(?:\\?[^\\s<>"\'`\\\\]*)?$', 'i');

      try {
        isValid = typeof url === 'string' && re.test(url);
      } catch (e) {
        console.log(e);
      } finally {
          return isValid;
      }
    },

    is_valid_yt_video: function (url) {

      // inicializacion lazy
      var isValid = false;
      // el id de YouTube siempre tiene 11 caracteres
      var re = /^(?:https?:\/\/)?(?:www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})(?:[&?#][^\s<>"'`\\]*)?$/i;

      // validacion Regex
      try {
        isValid = typeof url === 'string' && re.test(url);
      } catch (e) {
        console.log(e);
      } finally {
          return isValid;
      }
      // fin del try-catch block
    },

    getYTVideoId: function(url){
      var match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i);
      return match ? match[1] : null;
    },

    getEmbeddedCode: function (url){
      var id = this.getYTVideoId(url);
      var code = '<iframe width="560" height="315" src="https://www.youtube.com/embed/'+id+ '" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
      return code;
    },

    getVideoTag: function(url){
      var tag = '<video controls preload="metadata" src="'+escapeHtml(url)+'" style="max-height: 400px;max-width: 400px;"></video>';
      return tag;
    },

    getImageTag: function(url){
      var tag = '<img src="'+escapeHtml(url)+'" style="max-height: 400px;max-width: 400px;">';
      return tag;
    },

    // solo se aceptan colores hexadecimales; cualquier otra cosa se reemplaza
    sanitizeColor: function(color){
      return (typeof color === 'string' && /^#[0-9a-f]{3,8}$/i.test(color)) ? color : '#000000';
    },

    validateMessage: function(msg){
      // Handle invalid input
      if (!msg || typeof msg !== 'string') {
        return JSON.stringify({ mensaje: '' });
      }

      try {
        var obj = JSON.parse(msg);
        if (!obj || typeof obj !== 'object') {
          throw new Error('El mensaje no es un objeto JSON');
        }

        var texto = typeof obj.mensaje === 'string' ? obj.mensaje.trim() : '';

        // el nombre y el color tambien llegan del cliente: nada de HTML sin escapar
        obj.nombre = escapeHtml(obj.nombre || 'Anonimo');
        obj.color = this.sanitizeColor(obj.color);

        if(this.is_valid_url_image(texto)){
          console.log("Es una imagen!")
          obj.mensaje = this.getImageTag(texto);
        }
        else if(this.is_valid_url_video(texto)){
          console.log("Es un video!")
          obj.mensaje = this.getVideoTag(texto);
        }
        else if(this.is_valid_yt_video(texto)){
          console.log("Es un video!")
          obj.mensaje = this.getEmbeddedCode(texto);
        }
        else{
          console.log("Es un texto!")
          // cualquier otra cosa (incluido <script>) se muestra como texto plano inofensivo
          obj.mensaje = escapeHtml(texto);
        }

        return JSON.stringify(obj);
      } catch (e) {
        console.log('Error processing message:', e);
        return JSON.stringify({ mensaje: escapeHtml(msg) }); // nunca devolver el original sin escapar
      }
    }

  // fin del modulo
  };
