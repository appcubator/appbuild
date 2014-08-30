'use strict';

var SoftErrorView = require('../SoftErrorView').SoftErrorView;
var DialogueView = require('../mixins/DialogueView').DialogueViews;

var NodeModelDataView = Backbone.View.extend({
    el: null,
    tagName: 'div',
    collection: null,
    parentName: "",
    className: 'data-view',
    subviews: [],

    events: {},


    initialize: function (tableModel) {
        _.bindAll(this);
        this.model = tableModel;
    },

    render: function () {
        this.el.innerHTML = 'Coming soon...';
        return this;
    },


});

exports.NodeModelDataView = NodeModelDataView;
