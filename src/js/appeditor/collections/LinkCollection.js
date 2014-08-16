var LinkModel = require('../models/LinkModel').LinkModel;

var LinkCollection = Backbone.Collection.extend({
    model: LinkModel
});

exports.LinkCollection = LinkCollection;
