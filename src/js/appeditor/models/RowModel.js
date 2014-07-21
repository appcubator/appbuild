    'use strict';

    var ColumnModel = require('./ColumnModel');
    var RowModel = Backbone.Model.extend({

        initialize: function(bone) {

            var columnCollection = Backbone.Collection.extend({
                model: ColumnModel
            });
            
            var columnsColl = new columnCollection();
            columnsColl.add(bone.columns || []);
            this.set("columns", columnsColl);

        },

        toJSON: function(options) {
            var json = _.clone(this.attributes);
            if(json.columns) json.columns = json.columns.serialize(options);

            return json;
        }

    });

    exports.RowModel = RowModel;