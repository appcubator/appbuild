  require('./BackboneModal');

  var SimpleModalView = Backbone.ModalView.extend({
      tagName: 'div',
      className: 'deployed',

      initialize: function (data) {
          this.render(data.img, data.text);
      },

      render: function (img, text) {
          if (img) {
              this.el.innerHTML += '<img height="300" src="/static/img/' + img + '">';
          }

          if (text) {
              this.el.innerHTML += '<h4>' + text + '</h4>';
          }
          return this;
      }
  });

  exports.SimpleModalView = SimpleModalView;
