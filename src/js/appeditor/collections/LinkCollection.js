var LinkModel = require('../models/LinkModel');

  var LinkCollection = Backbone.Collection.extend({
    model: LinkModel
  });

  exports.LinkCollection = LinkCollection;
