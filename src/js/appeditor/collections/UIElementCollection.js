var UIElementModel = require('../models/UIElementModel');

  var UIElementCollection = Backbone.Collection.extend({
    model : UIElementModel,

    initialize: function (models, type) {
      this.type = type;
    }
  });

  exports.UIElementCollection = UIElementCollection;
