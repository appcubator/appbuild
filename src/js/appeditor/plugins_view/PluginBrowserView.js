    'use strict';

    require('../mixins/BackboneModal');

    var PluginModel = require('../models/PluginModel').PluginModel;

    var PluginBrowserView = Backbone.ModalView.extend({
        className: "plugin-browser-panel",
        width: 800,
        height: 630,
        padding: 0,

        events: {
            'click .addPluginButton': 'addPlugin'
        },

        initialize: function () {
            _.bindAll(this);
            this.render();
        },

        currentList: null,

        render: function () {
            var self = this;
            var loadingSpin = util.addLoadingSpin(this.el);

            $.ajax({
                type: "GET",
                url: "//plugins.appcubator.com/plugins/list",
                dataType: "json",
                success: function (data) {
                    console.log(data);
                    $(loadingSpin).remove();
                    data = {};
                    self.layoutPlugins(data);
                }
            });
            return this;
        },

        layoutPlugins: function (listPlugins) {
            this.currentList = listPlugins;
            var template = util.getHTML('plugin-browser');
            this.el.innerHTML = _.template(template, {
                pluginsList: listPlugins
            });
        },

        addPlugin: function (e) {
            /* Installs the plugin */
            var ind = e.currentTarget.id.replace('add-', '');
            var plugin = this.currentList[ind];
            v1State.get('plugins').install(plugin);
            e.currentTarget.innerHTML = 'Plugin Installed ✔';
        }

    });

    exports.PluginBrowserView = PluginBrowserView;
