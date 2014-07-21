var SlideModel = require('models/SlideModel').SlideModel;

  var SlideCollection = Backbone.Collection.extend({
    model : SlideModel
  });

  exports.SlideCollection = SlideCollection;
