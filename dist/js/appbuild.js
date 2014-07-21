(function(){var require = function (file, cwd) {
    var resolved = require.resolve(file, cwd || '/');
    var mod = require.modules[resolved];
    if (!mod) throw new Error(
        'Failed to resolve module ' + file + ', tried ' + resolved
    );
    var cached = require.cache[resolved];
    var res = cached? cached.exports : mod();
    return res;
};

require.paths = [];
require.modules = {};
require.cache = {};
require.extensions = [".js",".coffee",".json"];

require._core = {
    'assert': true,
    'events': true,
    'fs': true,
    'path': true,
    'vm': true
};

require.resolve = (function () {
    return function (x, cwd) {
        if (!cwd) cwd = '/';
        
        if (require._core[x]) return x;
        var path = require.modules.path();
        cwd = path.resolve('/', cwd);
        var y = cwd || '/';
        
        if (x.match(/^(?:\.\.?\/|\/)/)) {
            var m = loadAsFileSync(path.resolve(y, x))
                || loadAsDirectorySync(path.resolve(y, x));
            if (m) return m;
        }
        
        var n = loadNodeModulesSync(x, y);
        if (n) return n;
        
        throw new Error("Cannot find module '" + x + "'");
        
        function loadAsFileSync (x) {
            x = path.normalize(x);
            if (require.modules[x]) {
                return x;
            }
            
            for (var i = 0; i < require.extensions.length; i++) {
                var ext = require.extensions[i];
                if (require.modules[x + ext]) return x + ext;
            }
        }
        
        function loadAsDirectorySync (x) {
            x = x.replace(/\/+$/, '');
            var pkgfile = path.normalize(x + '/package.json');
            if (require.modules[pkgfile]) {
                var pkg = require.modules[pkgfile]();
                var b = pkg.browserify;
                if (typeof b === 'object' && b.main) {
                    var m = loadAsFileSync(path.resolve(x, b.main));
                    if (m) return m;
                }
                else if (typeof b === 'string') {
                    var m = loadAsFileSync(path.resolve(x, b));
                    if (m) return m;
                }
                else if (pkg.main) {
                    var m = loadAsFileSync(path.resolve(x, pkg.main));
                    if (m) return m;
                }
            }
            
            return loadAsFileSync(x + '/index');
        }
        
        function loadNodeModulesSync (x, start) {
            var dirs = nodeModulesPathsSync(start);
            for (var i = 0; i < dirs.length; i++) {
                var dir = dirs[i];
                var m = loadAsFileSync(dir + '/' + x);
                if (m) return m;
                var n = loadAsDirectorySync(dir + '/' + x);
                if (n) return n;
            }
            
            var m = loadAsFileSync(x);
            if (m) return m;
        }
        
        function nodeModulesPathsSync (start) {
            var parts;
            if (start === '/') parts = [ '' ];
            else parts = path.normalize(start).split('/');
            
            var dirs = [];
            for (var i = parts.length - 1; i >= 0; i--) {
                if (parts[i] === 'node_modules') continue;
                var dir = parts.slice(0, i + 1).join('/') + '/node_modules';
                dirs.push(dir);
            }
            
            return dirs;
        }
    };
})();

require.alias = function (from, to) {
    var path = require.modules.path();
    var res = null;
    try {
        res = require.resolve(from + '/package.json', '/');
    }
    catch (err) {
        res = require.resolve(from, '/');
    }
    var basedir = path.dirname(res);
    
    var keys = (Object.keys || function (obj) {
        var res = [];
        for (var key in obj) res.push(key);
        return res;
    })(require.modules);
    
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.slice(0, basedir.length + 1) === basedir + '/') {
            var f = key.slice(basedir.length);
            require.modules[to + f] = require.modules[basedir + f];
        }
        else if (key === basedir) {
            require.modules[to] = require.modules[basedir];
        }
    }
};

(function () {
    var process = {};
    var global = typeof window !== 'undefined' ? window : {};
    var definedProcess = false;
    
    require.define = function (filename, fn) {
        if (!definedProcess && require.modules.__browserify_process) {
            process = require.modules.__browserify_process();
            definedProcess = true;
        }
        
        var dirname = require._core[filename]
            ? ''
            : require.modules.path().dirname(filename)
        ;
        
        var require_ = function (file) {
            var requiredModule = require(file, dirname);
            var cached = require.cache[require.resolve(file, dirname)];

            if (cached && cached.parent === null) {
                cached.parent = module_;
            }

            return requiredModule;
        };
        require_.resolve = function (name) {
            return require.resolve(name, dirname);
        };
        require_.modules = require.modules;
        require_.define = require.define;
        require_.cache = require.cache;
        var module_ = {
            id : filename,
            filename: filename,
            exports : {},
            loaded : false,
            parent: null
        };
        
        require.modules[filename] = function () {
            require.cache[filename] = module_;
            fn.call(
                module_.exports,
                require_,
                module_,
                module_.exports,
                dirname,
                filename,
                process,
                global
            );
            module_.loaded = true;
            return module_.exports;
        };
    };
})();


require.define("path",function(require,module,exports,__dirname,__filename,process,global){function filter (xs, fn) {
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (fn(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length; i >= 0; i--) {
    var last = parts[i];
    if (last == '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Regex to split a filename into [*, dir, basename, ext]
// posix version
var splitPathRe = /^(.+\/(?!$)|\/)?((?:.+?)?(\.[^.]*)?)$/;

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
var resolvedPath = '',
    resolvedAbsolute = false;

for (var i = arguments.length; i >= -1 && !resolvedAbsolute; i--) {
  var path = (i >= 0)
      ? arguments[i]
      : process.cwd();

  // Skip empty and invalid entries
  if (typeof path !== 'string' || !path) {
    continue;
  }

  resolvedPath = path + '/' + resolvedPath;
  resolvedAbsolute = path.charAt(0) === '/';
}

// At this point the path should be resolved to a full absolute path, but
// handle relative paths to be safe (might happen when process.cwd() fails)

// Normalize the path
resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
var isAbsolute = path.charAt(0) === '/',
    trailingSlash = path.slice(-1) === '/';

// Normalize the path
path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }
  
  return (isAbsolute ? '/' : '') + path;
};


// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    return p && typeof p === 'string';
  }).join('/'));
};


exports.dirname = function(path) {
  var dir = splitPathRe.exec(path)[1] || '';
  var isWindows = false;
  if (!dir) {
    // No dirname
    return '.';
  } else if (dir.length === 1 ||
      (isWindows && dir.length <= 3 && dir.charAt(1) === ':')) {
    // It is just a slash or a drive letter with a slash
    return dir;
  } else {
    // It is a full dirname, strip trailing slash
    return dir.substring(0, dir.length - 1);
  }
};


exports.basename = function(path, ext) {
  var f = splitPathRe.exec(path)[2] || '';
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPathRe.exec(path)[3] || '';
};

exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

});

require.define("__browserify_process",function(require,module,exports,__dirname,__filename,process,global){var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
        && window.setImmediate;
    var canPost = typeof window !== 'undefined'
        && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'browserify-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('browserify-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    if (name === 'evals') return (require)('vm')
    else throw new Error('No such module. (Possibly not yet loaded)')
};

(function () {
    var cwd = '/';
    var path;
    process.cwd = function () { return cwd };
    process.chdir = function (dir) {
        if (!path) path = require('path');
        cwd = path.resolve(dir, cwd);
    };
})();

});

require.define("/Generator.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var Generator = function(pluginsGetter) {
        /* Pass either an object of the plugins to use, or pass a function which when called returns the plugins. */
        this.expander = initExpander();
        var expander = this.expander;

        if (typeof(pluginsGetter) === 'function') {
            this._getPlugins = pluginsGetter;
        } else {
            this._getPlugins = function() { return pluginsGetter; };
        }

        var self = this;

        this.expander.expandOnce = function (generators, genData) {

            var obj = {};
            try {
                var genID = this.parseGenID(genData.generate);
                var generatedObj = expander.constructGen(expander.findGenData(generators, genID))(generators, genData.data);
                obj = generatedObj;
            }
            catch(e) {
                console.log('Error in call to expandOnce for '+JSON.stringify(genID, null, 3)+':');
                console.log(e);
                throw e;
            }

            if(obj.html && genData.data && genData.data.cid) {

                var div = document.createElement('div');
                div.innerHTML = obj.html;
                var elements = div.childNodes;
                var element = div;

                if(elements.length == 1) {
                    element = elements[0];
                }

                element.dataset.cid = genData.data.cid;
                element.setAttribute('data-cid', genData.data.cid);
                obj.html = div.innerHTML;
            }

            return obj;
        }

    };

    Generator.prototype.generate = function(generatorPath, data) {
        var plugins = this._getPlugins();
        return this.expander.expand(plugins, {generate: generatorPath, data: data});
    };

    Generator.prototype.getGenerator = function(generatorPath) {
        var plugins = this._getPlugins();
        return this.expander.findGenData(plugins, this.expander.parseGenID(generatorPath));
    };

    exports.Generator = Generator;

});

require.define("/models/AppModel.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var AppInfoModel = require('./AppInfoModel').AppInfoModel,
        NodeModelCollection = require('../collections/NodeModelCollection').NodeModelCollection,
        TemplateCollection = require('../collections/TemplateCollection').TemplateCollection,
        PluginsModel = require('./PluginsModel').PluginsModel,
        RouteCollection = require('../collections/RouteCollection').RouteCollection;


    var AppModel = Backbone.Model.extend({

        currentPage: null,
        lazy: {},

        initialize: function(aState) {
            if (!aState) return;

            this.set('info', new AppInfoModel(aState.info));
            this.set('models', new NodeModelCollection(aState.models));
            this.set('templates', new TemplateCollection(aState.templates));
            this.set('plugins', new PluginsModel(aState.plugins || {}));
            this.set('routes', new RouteCollection(aState.routes || []));

            Backbone.Regrettable.bind(this.get('templates'));
            Backbone.Regrettable.bind(this.get('models'));
            Backbone.Regrettable.bind(this.get('routes'));

        },

        getTableModelWithName: function(nameStr) {
            var tableM = this.get('models').getTableWithName(nameStr);
            return tableM;
        },

        getTableModelWithCid: function(cid) {
            var tableM = this.get('models').get(cid);
            return tableM;
        },

        lazySet: function(key, coll) {
            this.lazy[key] = coll;
            this.set(key, new Backbone.Collection([]));
        },

        get: function(key) {
            if (this.lazy[key]) {
                this.set(key, this.lazy[key]);
                delete this.lazy[key];
            }

            return AppModel.__super__.get.call(this, key);
        },

        serialize: function(options) {
            var json = _.clone(this.attributes);
            json.info = json.info.serialize(options);
            json.models = json.models.serialize(options);
            json.templates = json.templates.serialize(options);
            json.routes = json.routes.serialize(options);
            json.plugins = json.plugins.serialize(options);

            return json;
        }
    });

    exports.AppModel = AppModel;

});

require.define("/models/AppInfoModel.js",function(require,module,exports,__dirname,__filename,process,global){  var AppInfoModel = Backbone.Model.extend({
    initialize: function(bone) {
      // this.set("name", bone.name);
      this.set("description", bone.description||"");
      this.set("keywords", bone.keywords||"");
    }
  });

  exports.AppInfoModel = AppInfoModel;
});

require.define("/collections/NodeModelCollection.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var NodeModelModel = require('../models/NodeModelModel').NodeModelModel;

    var NodeModelCollection = Backbone.Collection.extend({
        model: NodeModelModel,
        uniqueKeys: ["name"],

        createTableWithName: function(nameStr) {
            return this.push({
                name: nameStr
            });
        },

        getTableWithName: function(tableNameStr) {
            var table = this.where({
                name: tableNameStr
            })[0];
            return table;
        },

        getRelationsWithEntityName: function(tableNameStr) {
            var arrFields = [];
            this.each(function(table) {
                table.get('fields').each(function(fieldModel) {
                    if (fieldModel.has('entity_name') && fieldModel.get('entity_name') == tableNameStr) {
                        var obj = fieldModel.serialize();
                        obj.cid = fieldModel.cid;
                        obj.entity = table.get('name');
                        obj.entity_cid = table.cid;
                        arrFields.push(obj);
                    }
                });
            });

            return arrFields;
        },

        getAllRelations: function() {
            return this.reduce(function(memo, model) {
                return _.union(memo, model.getRelationalFields());
            }, []);
        },

    });

    exports.NodeModelCollection = NodeModelCollection;


});

require.define("/models/NodeModelModel.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var FieldsCollection = require('../collections/FieldsCollection').FieldsCollection;
    var NodeModelMethodModel = require('./NodeModelMethodModel').NodeModelMethodModel;

    var NodeModelModel = Backbone.Model.extend({

        defaults: {
            fields: {}
            //new FieldsCollection()
        },

        initialize: function(bone) {

            if (typeof bone === "string") {
                if (bone === "User") {
                    alert('TableModel init isnt supposed to receive user');
                    return;
                }
                bone = _.findWhere(appState.entities, {
                    name: bone
                });
            }

            if (bone.name) {
                this.set('name', bone.name || "New Table");
            }

            this.set('fields', new FieldsCollection());
            if (bone.fields) {
                this.get('fields').add(bone.fields);
            }

            var NodeModelCodeCollection = Backbone.Collection.extend({
                model: NodeModelMethodModel
            });
            this.set('functions', new NodeModelCodeCollection(bone.functions || []));

            if(!this.generate) { this.setGenerator("models.model"); }

            this.isUser = false;
        },

        toJSON: function() {
            var json = {};
            json = _.clone(this.attributes);
            json.fields = this.get('fields').serialize();
            json.functions = json.functions.serialize();
            return json;
        },

        addFieldsWithNames: function(nameArr) {
            _(nameArr).each(function(name) {
                this.get('fields').push({
                    name: name
                });
            }, this);
        },

        getFieldsColl: function() {
            var arr = this.get('fields');
            return arr;
        },

        getNormalFields: function() {
            var normalFields = this.get('fields').filter(function(field) {
                return !field.isRelatedField();
            });
            return normalFields;
        },

        getRelationalFields: function() {
            var relationalFields = this.get('fields').filter(function(field) {
                return field.isRelatedField();
            });
            return relationalFields;
        },

        hasMoneyField: function() {
            return (this.getMoneyField() !== null);
        },

        getMoneyField: function() {
            var moneyField = null;
            this.getFieldsColl().each(function(_fieldM) {
                if (_fieldM.get('type') == "money") {
                    moneyField = _fieldM;
                    return;
                }
            }, this);
            return moneyField;
        }
    });

    exports.NodeModelModel = NodeModelModel;

});

require.define("/collections/FieldsCollection.js",function(require,module,exports,__dirname,__filename,process,global){  var FieldModel = ('../models/FieldModel').FieldModel;

  var FieldsCollection = Backbone.Collection.extend({
    model : FieldModel,
    uniqueKeys: ["name"],
    getImageFields: function() {
      return this.filter(function(fieldM) { return fieldM.get('type') == "image"; });
    }
  });

  exports.FieldsCollection = FieldsCollection;
});

require.define("/models/NodeModelMethodModel.js",function(require,module,exports,__dirname,__filename,process,global){    var WhereCollection = require('../collections/WhereCollection');
    var Generator = require('../Generator');


    var NodeModelMethodModel = Backbone.Model.extend({
        /* Note that this may have name/code or it may be a generator */

        isGenerator: function() {
            return this.generate !== undefined;
        },

        getGenerated: function() {
            // TODO stop making objects of Generator every time
            if (this.isGenerator()) {
                return G.generate(this.generate, this.toJSON());
            } else {
                return this.serialize();
            }
        },

        getCode: function() {
            if (this.isGenerator()) {
                return String(G.generate(this.generate, this.toJSON()).code);
            } else {
                return this.get('code');
            }
        },

        /* mutating the type */
        getType: function() {
            var obj = this.getGenerated();
            if (obj.instancemethod)
                return 'instancemethod';
            else if (obj.enableAPI)
                return 'enableAPI';
            else
                return 'staticmethod';
        },
        setType: function(type) {
            if (this.isGenerator()) {
                alert('cant set type of a plugin\'s function');
                return;
            }
            var enableAPI = type === 'enableAPI' ? true : undefined;
            var instancemethod = type === 'instancemethod' ? true : undefined;
            this.set('enableAPI', enableAPI, {silent: true}); // only need to fire one change event
            this.set('instancemethod', instancemethod);
        },
        toggleType: function() {
            var currType = this.getType();
            var newType;
            if (currType === 'staticmethod')
                newType = 'instancemethod';
            else if (currType === 'instancemethod')
                newType = 'enableAPI';
            else if (currType === 'enableAPI')
                newType = 'staticmethod';
            else {
                alert('function type not recognized: ' + currType);
                newType = 'staticmethod';
            }
            this.setType(newType);
            return newType;
        },

        isInPackage: function (pluginName) {
            return this.generate && util.packageModuleName(this.generate).package == pluginName;
        }

    });

    exports.NodeModelMethodModel = NodeModelMethodModel;

});

require.define("/collections/WhereCollection.js",function(require,module,exports,__dirname,__filename,process,global){var WhereModel = require("../models/WhereModel").WhereModel;

  var WhereCollection = Backbone.Collection.extend({
    model: WhereModel,
    removeClauseWithName: function (keyStr) {
      this.each(function(clause) {
        if(clause.get('field_name') == keyStr) {
          this.remove(clause);
        }
      });
    }
  });

exports.WhereCollection = WhereCollection;

});

require.define("/models/WhereModel.js",function(require,module,exports,__dirname,__filename,process,global){  var WhereModel = Backbone.Model.extend({
    initialize: function(bone) { }
  });

  exports.WhereModel = WhereModel;
});

require.define("/collections/TemplateCollection.js",function(require,module,exports,__dirname,__filename,process,global){var TemplateModel = require('../models/TemplateModel').TemplateModel;

        var TemplateCollection = Backbone.Collection.extend({
            model: TemplateModel,

            getTemplateWithName: function(name) {
                var page = null;

                this.each(function(templateModel) {
                    if (templateModel.get('name') == name) {
                        page = templateModel;
                    }
                });

                return page;
            }
        });

        exports.TemplateCollection = TemplateCollection;
});

require.define("/models/TemplateModel.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var SectionCollection= require('../collections/SectionCollection').SectionCollection;

    var TemplateModel = Backbone.Model.extend({

        initialize: function(bone) {
            this.set('name', bone.name);
            this.set('head', bone.head || "");
            this.set('uielements', new SectionCollection(bone.uielements || []));

            if(!this.generate) {
                this.setGenerator('templates.page');
            }
        },

        getSections: function() {
            return this.get('uielements');
        },

        getUIElements: function() {
            if(this.widgetsCollection) return this.widgetsCollection;

            var WidgetCollection = require('../collections/WidgetCollection');
            var sections = this.getSections();
            this.widgetsCollection = new WidgetCollection();

            sections.each(function(sectionModel) {
                this.widgetsCollection.add(sectionModel.getWidgetsCollection().models);
                // this.bindColumn(columnModel);
            }, this);

            //this.get('columns').on('add', this.bindColumn);

            return this.widgetsCollection;

        },

        toJSON: function(options) {

            var json = _.clone(this.attributes);
            json.uielements = json.uielements.serialize(options);
            return json;
        }
    });

    exports.TemplateModel = TemplateModel;
});

require.define("/collections/SectionCollection.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';
    var SectionModel = require('../models/SectionModel').SectionModel;
    var WidgetCollection = require('./WidgetCollection').WidgetCollection;
    var ColumnModel = require('../models/ColumnModel').ColumnModel;

    var SectionCollection = Backbone.Collection.extend({

        model: SectionModel,

        initialize: function() {
            Backbone.Regrettable.bind(this);

            if(!this.generate) {
                this.setGenerator('templates.layoutSections');
            }
        },

        createSectionWithType: function(type) {

            switch(type) {

                case "navbar":
                    var sectionModel = new SectionModel();
                    sectionModel.setGenerator('templates.navbar');
                    this.add(sectionModel);
                    break;

                case "footer":
                    var sectionModel = new SectionModel();
                    sectionModel.setGenerator('templates.footer');
                    this.add(sectionModel);
                    break;

                default:
                    var sectionsLayouts = type.split('-');
                    var sectionModel = new SectionModel();
                    sectionModel.setupColumns();

                    _.each(sectionsLayouts, function(columnLayout) {
                        var columnM = new ColumnModel();
                        columnM.set('layout', columnLayout);
                        sectionModel.get('columns').push(columnM);
                    }, this);

                    this.add(sectionModel);
                    return;
                    break;
            }

        },

        getAllWidgets: function(argument) {
            if (!this.allWidgets) this.allWidgets = this.constructWidgetCollection();
            return this.allWidgets;
        },

        arrangeSections: function(fromInd, toInd) {
            this.models.splice(toInd, 0, this.models.splice(fromInd, 1)[0]);
            this.trigger('rearranged');
        },

        constructWidgetCollection: function() {
            var widgetCollection = new WidgetCollection();

            this.each(function(sectionModel) {
                if (!sectionModel.has('columns')) return;
                var collection = sectionModel.get('columns');
                collection.each(function(columnModel) {

                    var widgetColl = columnModel.get('uielements');
                    widgetCollection.add(widgetColl.models);
                    widgetColl.on('add', function(model) {
                        widgetCollection.add(model);
                    });

                });
            }, this);

            this.on('add', function(sectionModel) {
                if(!sectionModel.has('columns')) return;

                var collection = sectionModel.get('columns');
                collection.each(function(columnModel) {

                    var widgetColl = columnModel.get('uielements');
                    widgetCollection.add(widgetColl.models);
                    widgetColl.on('add', function(model) {
                        widgetCollection.add(model);
                    });

                });
            });

            /* TODO: go one level deeper on listening */

            return widgetCollection;
        }
    });

    exports.SectionCollection = SectionCollection;

});

require.define("/models/SectionModel.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var WidgetCollection = require('../collections/WidgetCollection');
    var ColumnModel = require('../models/ColumnModel');

    var SectionModel = Backbone.Model.extend({

        initialize: function(bone) {

            var bone = bone || {};
           
            if (bone.columns) {
                var ColumnCollection = Backbone.Collection.extend({ model: ColumnModel });
                var columnsColl = new ColumnCollection();
                columnsColl.add(bone.columns || []);
                this.set("columns", columnsColl);
            }

            if(!this.generate) {
                this.generate = "templates.layoutSection";
            }
        },

        setupColumns: function() {
            var ColumnCollection = Backbone.Collection.extend({ model: ColumnModel });
            var columnsColl = new ColumnCollection();
            this.set("columns", columnsColl);
        },

        updateJSON: function(bone) {

            var cleanBone = _.omit(bone, ['layout', 'data', 'context', 'fields']);
            this.set(cleanBone);

            if (bone.columns) {
                var ColumnCollection = Backbone.Collection.extend({ model: ColumnModel });
                var columnsColl = new ColumnCollection();
                columnsColl.add(bone.columns || []);
                this.set("columns", columnsColl);
            }

            _.each(this.attributes, function(val, key) {
                if(!bone[key]) {
                    this.unset(key);
                }
            }, this);

        },

        getWidgetsCollection: function () {
            if (this.widgetsCollection) { return this.widgetsCollection; }

            this.widgetsCollection = new Backbone.Collection();

            if (this.has('columns')) {

                this.get('columns').each(function(columnModel) {
                    this.widgetsCollection.add(columnModel.get('uielements').models);
                    columnModel.get('uielements').each(function(widgetModel) {
                        widgetModel.collection = columnModel.get('uielements');
                    });
                    this.bindColumn(columnModel);
                }, this);
                this.get('columns').on('add', this.bindColumn);
            }


            return this.widgetsCollection;
        },

        bindColumn: function (columnModel) {

            columnModel.get('uielements').on('remove', function(widgetModel) {
                this.widgetsCollection.remove(widgetModel, columnModel);
            }, this);

            columnModel.get('uielements').on('add', function(widgetModel) {
                this.widgetsCollection.add(widgetModel, columnModel);
            }, this);

        },

        toJSON: function(options) {
            var options = options || {};
            var json = _.clone(this.attributes);
            if(json.columns) {
                json.columns = json.columns.serialize(options);
            }
            return json;
        }
    });

    exports.SectionModel = SectionModel;

});

require.define("/collections/WidgetCollection.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var WidgetModel = require("../models/WidgetModel").WidgetModel;
    var Generator = require("../Generator").Generator;

    var WidgetCollection = Backbone.Collection.extend({

        model: WidgetModel,

        initialize: function() {
            Backbone.Regrettable.bind(this);
        },

        createElementWithGenPath: function(layout, generatorPath, type, extraData) {
            this.createUIElement(type, layout, generatorPath, extraData);
        },

        createUIElement: function(type, layout, generatorPath, extraData) {
            var generator = G.getGenerator(generatorPath);

            var widget = {};
            widget.layout = layout;
            widget.type = type;

            if (generator.defaults) {
                widget = _.extend(widget, generator.defaults);
            }
            if (extraData) {
                widget = _.extend(widget, extraData);
            }

            var widgetModel = new WidgetModel(widget);
            widgetModel.setGenerator(generatorPath);

            this.push(widgetModel);

            return widgetModel;
        }

    });

    exports.WidgetCollection = WidgetCollection;

});

require.define("/models/WidgetModel.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var LayoutModel = require('./LayoutModel');
    var FormFieldCollection = require('../collections/FormFieldCollection');

    var WidgetModel = Backbone.Model.extend({
        selected: false,
        editMode: false,
        /* idAttribute as cid allows duplicate widgets to be stored in the collection */
        idAttribute: 'cid',

        initialize: function(bone, isNew) {

            if (bone.layout) {
                this.set('layout', new LayoutModel(bone.layout || {}));
            }

            this.set('context', new Backbone.Collection(bone.context || []));

            if (bone.fields) { this.set('fields', new FormFieldCollection(bone.fields || [])); }
            if (bone.row) {
                var RowModel    = require('../models/RowModel');
                this.set('row', new RowModel(bone.row || {}));
            }

            this.bind('editModeOn', function() {
                this.editMode = true;
            }, this);
            this.bind('editModeOff', function() {
                this.editMode = false;
            }, this);

        },

        updateJSON: function(bone) {

            var cleanBone = _.omit(bone, ['data', 'layout', 'fields']);
            this.set(cleanBone, {silent: true});
            
            if (this.has('layout') && bone.layout) {
                console.log(bone.layout);
                this.get('layout').set(bone.layout, {silent: true});
            }

            if (this.has('fields') && bone.fields) {
                this.get('fields').set(bone.fields, {silent: true});
            }

            _.each(this.attributes, function(val, key) {
                if(!bone[key]) {
                    this.unset(key, {silent: true});
                }
            }, this);

            this.trigger('change');
        },

        remove: function() {
            if (this.get('deletable') === false) return;
            if (this.collection) {
                this.collection.remove(this);
            }
        },

        isFullWidth: function() {
            return this.get('layout').get('isFull') === true;
        },

        moveLeft: function() {
            if (this.isFullWidth()) return;

            if (this.get('layout').get('left') < 1 || this.collection.editMode) return;
            this.get('layout').set('left', this.get('layout').get('left') - 1);
        },

        moveRight: function() {
            if (this.isFullWidth()) return;

            var maxWidth = this.collection.grid.maxWidth;
            if (maxWidth && this.get('layout').get('left') + this.get('layout').get('width') > (maxWidth - 1)) return;
            this.get('layout').set('left', this.get('layout').get('left') + 1);
        },

        moveUp: function() {
            if (this.get('layout').get('top') < 1 || this.collection.editMode) return;
            this.get('layout').set('top', this.get('layout').get('top') - 1);
        },

        moveDown: function() {
            if (this.collection.editMode) return;
            this.get('layout').set('top', this.get('layout').get('top') + 1);
        },

        setupPageContext: function(pageModel) {
            // TODO: Fix this
            //var entityList = pageModel.getContextEntities();
            var entityList = [];
            var contextList = this.get('context');

            _(entityList).each(function(entity) {
                contextList.push({
                    entity: entity,
                    context: 'Page.' + entity
                });
            });

            return this;
        },

        setupLoopContext: function(entityModel) {
            var newContext = {
                entity: entityModel.get('name'),
                context: 'loop.' + entityModel.get('name')
            };
            var isUnique = true;

            this.get('context').each(function(context) {
                if (_.isEqual(context.serialize(), newContext)) {
                    isUnique = false;
                }
            });

            if (isUnique) {
                this.get('context').push({
                    entity: entityModel.get('name'),
                    context: 'loop.' + entityModel.get('name')
                });
            }

            return this;
        },

        getAction: function() {
            if (this.get('data').has('container_info')) return this.get('data').get('container_info').get('action');
            else return this.get('data').get('action');

            return;
        },

        getRow: function() {
            if (!this.has('row')) return null;
            return this.get('row');
        },

        getContent: function() {
            return this.get('content');
        },

        getForm: function() {
            if (!this.get('data').has('container_info')) return null;
            return this.get('data').get('container_info').get('form');
        },

        hasForm: function() {
            if (this.has('fields')) return true;
            return false;
        },

        getLoginRoutes: function() {

            if (this.get('data').has('loginRoutes')) {
                return this.get('data').get('loginRoutes');
            }

            if (this.get('data').has('container_info') &&
                this.get('data').get('container_info').has('form')) {
                return this.get('data').get('container_info').get('form').get('loginRoutes');
            }

            return null;
        },


        getSearchQuery: function() {
            return this.get('data').get('searchQuery');
        },

        isNode: function() {
            return this.get('type') == "node";
        },

        isImage: function() {
            return (this.isNode() && this.get('data').get('nodeType') == "images");
        },

        isBox: function() {
            return (this.isNode() && this.get('data').get('nodeType') == "boxes");
        },

        isBgElement: function() {
            if ((this.get('type') == "node" && this.get('data').get('nodeType') == "boxes") ||
                (this.get('type') == "imageslider")) return true;
            return false;
        },

        isForm: function() {
            return this.get('type') == "form";
        },

        isLoginForm: function() {
            return false;
            //return (this.isForm() && this.get('data').get('container_info').get('action') == "login") || (this.get('type') == "thirdpartylogin");
        },

        isList: function() {
            if (this.get('type') == "loop") return true;
            return false;
        },

        isCustomWidget: function() {
            if (this.get('type') == "custom" ||
                this.get('data').has('cssC') ||
                this.get('data').has('jsC') ||
                this.get('data').has('htmlC')) return true;
        },

        isBuyButton: function() {
            return this.get('type') === "buybutton";
        },

        isSearchList: function() {
            return this.get('data').has('container_info') && this.get('data').get('container_info').get('action') == "searchlist";
        },

        getBottom: function() {
            return this.get('layout').get('height') + this.get('layout').get('top');
        },

        getWidgetsCollection: function () {
            if(this.widgetsCollection) return this.widgetsCollection;
            var WidgetCollection = require('../collections/WidgetCollection');
            this.widgetsCollection = new WidgetCollection();

            this.get('row').get('columns').each(function(columnModel) {
                this.widgetsCollection.add(columnModel.get('uielements').models);
                this.bindColumn(columnModel);
            }, this);

            this.get('row').get('columns').on('add', this.bindColumn);

            return this.widgetsCollection;
        },


        bindColumn: function (columnModel) {

            columnModel.get('uielements').on('remove', function(widgetModel) {
                this.widgetsCollection.remove(widgetModel, columnModel);
            }, this);

            columnModel.get('uielements').on('add', function(widgetModel) {
                this.widgetsCollection.add(widgetModel, columnModel);
            }, this);

        },

        toJSON: function(options) {
            options = options || {};

            var json = _.clone(this.attributes);
            json = _.omit(json, 'selected', 'deletable', 'context');

            if (json.layout) { json.layout = this.get('layout').serialize(options); }
            if (json.fields) { json.fields = json.fields.serialize(options); }
            // if (json.row) { json.row = json.row.serialize(options); }
            if (json.context) delete json.context;

            return json;
        },

        safeExpand: function() {
            try {
                return this.expand();
            } catch (e) {
                console.log("Expander error:");
                console.log(e);
                return {html: '<img src="http://cdn.memegenerator.net/instances/500x/43563104.jpg">', js: '', css: ''};
            }
        }

    });

    exports.WidgetModel = WidgetModel;

});

require.define("/models/LayoutModel.js",function(require,module,exports,__dirname,__filename,process,global){
    var LayoutModel = Backbone.Model.extend({
        
        defaults: {
            'alignment': 'left'
        }

    });

    exports.LayoutModel = LayoutModel;
});

require.define("/collections/FormFieldCollection.js",function(require,module,exports,__dirname,__filename,process,global){var FormFieldModel = require('../models/FormFieldModel').FormFieldModel;


    var FormFieldCollection = Backbone.Collection.extend({
      model: FormFieldModel
    });

    exports.FormFieldCollection = FormFieldCollection;
});

require.define("/models/FormFieldModel.js",function(require,module,exports,__dirname,__filename,process,global){        var FormFieldModel = Backbone.Model.extend({
            initialize: function(bone) {
                this.set('field_name', bone.field_name);
                if (bone.type) {
                    this.set('type', bone.type);
                }

                this.set('label', (bone.label || bone.name));
                this.set('placeholder', (bone.placeholder || bone.name) || "placeholder");
                this.set('required', (bone.required || true));

                if (!this.generate) {
                    this.generate = "root.uielements.form-field";
                }
            },

            toJSON: function() {
                var json = _.clone(this.attributes);
                if (json.displayType == "button") {
                    json = _.omit(json, 'options');
                }
                return json;
            }
        });

        exports.FormFieldModel = FormFieldModel;

});

require.define("/models/RowModel.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

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
});

require.define("/models/ColumnModel.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var ColumnModel = Backbone.Model.extend({

        initialize: function(bone) {
            var bone = bone || {};
            var WidgetCollection = require('../collections/WidgetCollection');
            this.set("uielements", new WidgetCollection(bone.uielements||[]));

            if (!this.generate) {
                this.generate = "templates.layoutColumn";
            }

            Backbone.Regrettable.bind(this);
        },

        addElement: function(type, extraData) {
            var layout = {  };
            this.get('uielements').createElement(layout, className, id);
        },

        addElementWithPath: function (type, generatorPath, extraData) {
            var layout = {  };
            this.get('uielements').createElementWithGenPath(layout, generatorPath, type, extraData);
        },

        toJSON: function(options) {
            options = options || {};

            var json = _.clone(this.attributes);
            json.uielements = json.uielements.serialize(options);
            if(options.generate) {
                json.cid = this.cid;
            }
            return json;
        }
    });

    exports.ColumnModel = ColumnModel;
});

require.define("/models/PluginsModel.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var PluginModel = require('./PluginModel');
    var NodeModelMethodModel = require('./NodeModelMethodModel');

    /* Contains metadata and convenience methods for Plugins */
    var PluginsModel = Backbone.Model.extend({

        initialize: function(bone) {

            _.each(bone, function(val, key) {

                /* Help initialize plugins that don't have proper metadata. */
                /* TODO put this in the initialize method of the PluginModel instead. */
                val.metadata = val.metadata || {};
                val.metadata.name = val.metadata.name || key;

                var pluginModel = new PluginModel(val);
                this.set(key, pluginModel);
            }, this);

        },

        /* builtin plugins are not in the model by default,
         * so this fn includes them in its return value 
         * 
         * returns { pluginName1: plugingModel1, ... } */
        getAllPlugins: function() {

            var plugins = {};
            plugins = _.extend(plugins, _.clone(this.attributes)); // pluginName : pluginModel object

            /* Start with local plugins and merge builtin plugins in, not overwriting local plugins. */

            _.each(G.expander.builtinGenerators, function(builtInPlugin, pluginName) {
                var pluginModel = new PluginModel(builtInPlugin);

                if (!plugins[pluginName]) {
                    plugins[pluginName] = pluginModel;
                } else {
                    /* User might have forked a generator from a builtin plugin */
                    var localCopy = new PluginModel();

                    // app-state copy of the package 
                    _.each(plugins[pluginName].attributes, function(val, key) {
                        localCopy.set(key, _.clone(val));
                    }); 

                    // iterating over the builtin ones and mergins the gens
                    _.each(builtInPlugin, function(gens, moduleName) {
                        if (moduleName === 'metadata')
                            return;
                        if(!localCopy.has(moduleName)) {
                            localCopy.set(moduleName, gens);
                        } else {
                            localCopy.set(moduleName, _.union(localCopy.get(moduleName), gens));
                        }
                    });

                    plugins[pluginName] = localCopy;
                }
            });

            return plugins;
        },

        getAllPluginsSerialized: function() {
            var plugins = this.getAllPlugins();
            var serializedPlugins = {};

            _.each(plugins, function(val, key) {
                serializedPlugins[key] = val.serialize();
            });

            return util.deepCopy(serializedPlugins);
        },

        install: function(plugin) {
            if (!plugin.metadata || !plugin.metadata.name)
                alert('not installing because this plugin doesn\'t have metadata.');
            var pluginModel = new PluginModel(plugin);
            this.set(plugin.metadata.name, pluginModel);
        },

        uninstall: function(pluginName) {
            this.unset(pluginName);
            // TODO do something about generator references to this plugin?
        },

        getPluginsWithModule: function(moduleName) {
            return _.filter(this.getAllPlugins(), function(pluginModel, pluginName) {
                pluginModel.name = pluginName;
                return pluginModel.has(moduleName);
            });
        },

        getAllPluginsWithModule: function(moduleName) {
            var plugins = this.getAllPlugins();
            return _.filter(plugins, function(pluginModel) {
                return pluginModel.has(moduleName);
            });
        },

        getGeneratorsWithModule: function(generatorModule) {
            var generators = _.flatten(_.map(this.getAllPlugins(), function(pluginModel, packageName) {
                return pluginModel.getGensByModule(generatorModule);
            }));

            return generators;
        },

        getAllGeneratorsWithModule: function(moduleName) {
            var plugins = this.getAllPluginsWithModule(moduleName);
            plugins = _.filter(plugins, function(pluginModel, key) {
                return pluginModel.has(moduleName);
            });

            var generators = _.flatten(_.map(plugins, function(pluginModel) {
                var gens = pluginModel.get(moduleName);
                _.each(gens, function(gen) { gen.package = pluginModel.getName(); });
                return gens;
            }));

            return generators;
        },

        isPluginInstalledToModel: function(pluginModel, nodeModelModel) {
            var gens = pluginModel.getGensByModule('model_methods');
            var genNames = _.map(gens, function(g) { return pluginModel.getName() + '.model_methods.' + g.name; });
            var functions = nodeModelModel.get('functions').map(function(fn) { return fn.generate; });
            return _.intersection(genNames, functions).length > 0 ? true : false;
        },

        installPluginToModel: function(pluginModel, nodeModelModel) {
            if (!pluginModel) {
                alert('yo, what are you doing.');
                return;
            }
            var gens = pluginModel.getGensByModule('model_methods');

            _.each(gens, function(gen) {
                var methodModel = new NodeModelMethodModel();
                var genIDStr = pluginModel.getName() + '.model_methods.' + gen.name;
                methodModel.setGenerator(genIDStr);
                methodModel.set('modelName', nodeModelModel.get('name'));
                methodModel.set('name', gen.name);
                nodeModelModel.get('functions').push(methodModel);
            });
        },

        uninstallPluginToModel: function(plugin, nodeModelModel) {
            var gens = [];

            nodeModelModel.get('functions').each(function(fn) {
                if(fn.isInPackage(plugin.getName())) {
                    gens.push(fn);
                }
            });

            nodeModelModel.get('functions').remove(gens);
        },

        fork: function (generatorPath, newName) {
            var generator = G.getGenerator(generatorPath);
            var genObj = _.clone(generator);

            var genID = util.packageModuleName(generatorPath);
            genID.name = newName;
            genObj.name = newName;

            if (!this.has(genID.package)) {
                // NOTE this only happens when builtin generator is forked
                this.set(genID.package, new PluginModel({metadata: {name: genID.package}}));
            }

            if (!this.get(genID.package).has(genID.module)) {
                // NOTE this only happens when builtin generator is forked
                this.get(genID.package).set(genID.module, []);
            }

            this.get(genID.package).get(genID.module).push(genObj);

            this.trigger('fork');

            return [genID.package, genID.module, genID.name].join('.');
        },

        assertWeHaveGenerator: function(generatorPath) {
            // ensures the plugin is either builin or in the app state
                // throws an error if for some reason the generatorPath refers to a nonexistant generator
            util.findGenerator(this.serialize(), generatorPath);
        },

        isGeneratorBuiltin: function(generatorPath) {
            this.assertWeHaveGenerator(generatorPath);

            var genID = util.packageModuleName(generatorPath);

            // no generator of this package has not been forked yet, it must be built in
            if (!this.has(genID.package)) {
                return false;
            }

            // let's try to find the generator in the app state.
            var localGen = _.find(this.get(genID.package).getGensByModule(genID.module), function(gen) { return gen.name === genID.name; });

            // expect it to not be found if it's builtin.
            return localGen === undefined;
        },

        isGeneratorEditable: function(generatorPath) {
            return !this.isGeneratorBuiltin(generatorPath);
        },

        isNameUnique: function(newPackageModuleName) {
            // TODO FIXME
            // 1. this doesn't include builtins
            // 2. shouldn't you do a has check before doing get?

            var plugin = this.get(newPackageModuleName.package);
            if (!plugin) return true;

            var module = plugin.get(newPackageModuleName.module);
            if (!module) return true;

            if (module[newPackageModuleName.name]) {
                return false;
            }

            return true;
        },

        toJSON: function() {
            var json = _.clone(this.attributes);

            _.each(json, function (val, key) {
                json[key] = val.serialize();
            });

            return json;
        }

    });

    exports.PluginsModel = PluginsModel;

});

require.define("/models/PluginModel.js",function(require,module,exports,__dirname,__filename,process,global){    var PluginModel = Backbone.Model.extend({

        getName: function() {
            return this.get('metadata').name;
        },

        getGensByModule: function (moduleName) {
            if (moduleName === 'metadata') throw 'metadata is not a module';
            if (this.has(moduleName))
                return this.get(moduleName);
            else
                return [];
        },

    });

    exports.PluginModel = PluginModel;

});

require.define("/collections/RouteCollection.js",function(require,module,exports,__dirname,__filename,process,global){    var RouteModel = require('../models/RouteModel').RouteModel;

    var RouteCollection = Backbone.Collection.extend({

        model: RouteModel,
        uniqueKeys: ["name"],

        getRouteWithTemplate: function(templateModel) {

            var templateName = templateModel.get('name');
            var routeM = null;
            this.each(function(routeModel) {
                if(routeModel.get('name') == templateName) {
                    routeM = routeModel;
                }
            });

            return routeM;
        },

        removePagesWithContext: function(tableM) {
            var arr = this.getPageModelsWithEntityName(tableM.get('name'));
            _.each(arr, function(pageM) {
                this.remove(pageM);
            }, this);
        }

    });

    exports.RouteCollection = RouteCollection;

});

require.define("/models/RouteModel.js",function(require,module,exports,__dirname,__filename,process,global){        var UrlModel = require('./UrlModel').UrlModel;

        var RouteModel = Backbone.Model.extend({

            defaults: {
                "name": "default-page"
            },

            initialize: function(bone) {
                bone = bone || {};
                if (bone.url && bone.url.length === 0) {
                    // homepage shouldn't have a customizable url
                    if (this.get('name') === 'Homepage') {
                        bone.url = [];
                    } else {
                        bone.url = [this.get('name') || "Page Name"];
                    }
                }

                this.set('url', new UrlModel(bone.url || {}));
            },

            getUrlString: function() {
                return '/' + this.get('url').toJSON().join('/');
            },

            addToContext: function(tableM) {
                this.get('url').get('urlparts').push({
                    value: '{{' + tableM.get('name') + '}}'
                });
            },

            hasContext: function(tableM) {
                return this.doesContainEntityName(tableM.get('name'));
            },

            doesContainEntityName: function(entityName) {
                return _.contains(this.get('url').get('urlparts').pluck('value'), '{{' + entityName + '}}');
            },

            getContextEntities: function() {
                var entities = [];
                this.get('url').get('urlparts').each(function(urlPart) {
                    var part = urlPart.get('value');
                    if (/{{([^\}]+)}}/g.exec(part)) entities.push(/\{\{([^\}]+)\}\}/g.exec(part)[1]);
                });
                return entities;
            },

            getContextSentence: function() {
                var entities = [];
                this.get('url').get('urlparts').each(function(urlPart) {
                    if (/{{([^\}]+)}}/g.exec(urlPart.get('value'))) entities.push(/\{\{([^\}]+)\}\}/g.exec(urlPart.get('value'))[1]);
                });

                if (entities.length === 0) {
                    return "";
                } else if (entities.length === 1) {
                    return "Page has a " + entities[0];
                } else {
                    var str = "Page has ";
                    _(entities).each(function(val, ind) {
                        if (ind == entities.length - 1) {
                            str += "and a " + val;
                        } else {
                            str += "a " + val + " ";
                        }
                    });

                    return str;
                }
            },

            getFields: function() {
                // TODO: fix this
                // var access = this.get('access_level');

                // if (access == "all") {
                //     return v1State.get('users').getCommonProps();
                // }
                // if (access == "users") {
                //     return v1State.get('users').getCommonProps();
                // }

                // var model = v1State.get('users').getUserTableWithName(access);
                // return model.getFieldsColl().models;

                return [];
            },

            updatePageName: function(urlModel, newPageName) {
                this.set('page_name', newPageName);
            },

            getLinkLang: function(contextArgs) {
                var str = "internal://" + this.get('name');
                var entities = this.getContextEntities();
                if (entities.length) {
                    str += '/?' + entities[0] + '=' + this.getPageContextDatalang();
                }
                return str;
            },

            getDataLang: function() {
                var str = "internal://" + this.get('name');
                return str;
            },

            getPageContextDatalang: function() {
                var entities = this.getContextEntities();
                return "Page." + entities[0];
            },

            validate: function() {
                var valid = true;
                var name = this.get('name');
                if (!util.isAlphaNumeric(name) || util.doesStartWithKeywords(name)) {
                    return false;
                }
            },

            setupUrl: function(name) {
                name = name.toLowerCase().replace(/ /g, '_');
                name = name.replace(/[^a-zA-Z0-9\s]+/g, '_');
                var urlparts = { value: name.toLowerCase().replace(/ /g, '_') };
                this.get('url').get('urlparts').reset([urlparts]);
            },

            isContextFree: function() {
                return (!this.get('url').get('urlparts').some(function(part) { return (/\{\{([^\}]+)\}\}/g).test(part.get('value')); }));
            },

            hasSearchList: function(searchOn) {
                var hasSearchList = false;
                this.get('uielements').each(function(widgetM) {
                    if(widgetM.isSearchList() && widgetM.get('data').get('container_info').get('entity').get('name') == searchOn) {
                        hasSearchList = true;
                    }
                });
                return hasSearchList;
            },

            toJSON: function() {
                var json = _.clone(this.attributes);
                if(json.url) { json.url = this.get('url').serialize(); }
                // json.navbar = this.get('navbar').serialize();
                // json.footer = this.get('footer').serialize();
                // json.uielements = this.get('uielements').serialize();
                return json;
            }
        });

        exports.RouteModel = RouteModel;

});

require.define("/models/UrlModel.js",function(require,module,exports,__dirname,__filename,process,global){
  var UrlModel = Backbone.Model.extend({
    defaults : {
    },

    initialize: function(bone) {
      var urlparts = [];

      if(bone) {
        urlparts = _(bone).map(function(value) {
          return {
            value: value
          };
        });
      }
      this.set('urlparts', new Backbone.Collection(urlparts));
    },

    getAppendixString: function() {
      return this.get('urlparts').pluck('value').join('/');
    },

    getUrlString: function(appSubdomain) {
      return (appUrl||'http://yourapp.com') + this.getAppendixString();
    },

    addUrlPart: function(value) {
      this.get('urlparts').push(value);
    },

    removeUrlPart: function(value) {
      var value = this.get('urlparts').remove(value);
    },

    toJSON: function() {
      var json = this.get('urlparts').pluck('value');
      return json;
    }
  });

  exports.UrlModel = UrlModel;

});

require.define("/models/ThemeModel.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var UIElementCollection = require('../collections/UIElementCollection').UIElementCollection;

    var ThemeModel = Backbone.Model.extend({

        initialize: function(themeState) {
            this.set('basecss', themeState.basecss || "font-size:14px;");
            //this.set('pages', new PageDesignCollection(themeState.pages));

            this.set('buttons', new UIElementCollection(themeState["buttons"], "button"));
            this.set('images', new UIElementCollection(themeState["images"], "image"));
            this.set('headerTexts', new UIElementCollection(themeState["headerTexts"], "header-text"));
            this.set('texts', new UIElementCollection(themeState["texts"], "text"));
            this.set('links', new UIElementCollection(themeState["links"], "link"));
            this.set('textInputs', new UIElementCollection(themeState["textInputs"], "text-input"));
            this.set('passwords', new UIElementCollection(themeState["passwords"], "password"));
            this.set('textAreas', new UIElementCollection(themeState["textAreas"], "text-area"));
            this.set('lines', new UIElementCollection(themeState["lines"], "line"));
            this.set('dropdowns', new UIElementCollection(themeState["dropdowns"], "dropdown"));
            this.set('boxes', new UIElementCollection(themeState["boxes"], "box"));
            this.set('forms', new UIElementCollection((themeState["forms"] || []), "form"));
            this.set('lists', new Backbone.Collection((themeState["lists"] || []), "list"));
            this.set('fonts', new Backbone.Collection(themeState["fonts"] || []));
        },

        getUIElementCollections: function() {

            return [this.get('buttons'), this.get('images'), this.get('headerTexts'),
                this.get('texts'), this.get('links'), this.get('textInputs'),
                this.get('passwords'), this.get('textAreas'), this.get('lines'),
                this.get('dropdowns'), this.get('boxes'), this.get('forms'),
                this.get('lists')];
        },

        getStyleWithClassAndType: function(className, type) {
            var model = null;

            if (!this.has(type))
            {
                type = this.rectifier(type);
                if (!this.has(type)) return null;
            }

            this.get(type).each(function(styleModel) {
                if (styleModel.get('class_name') == className) {
                    model = styleModel;
                }
            });

            return model;
        },

        getUIEVals: function(type) {

            if(this.has(type)) {
                return this.get(type);
            }

            switch(type) {
                case "button":
                    return this.getUIEVals("buttons");
                case "header":
                    return this.getUIEVals("headerTexts");
                case "image":
                    return this.getUIEVals("images");
                case "text":
                    return this.getUIEVals("texts");
                case "link":
                    return this.getUIEVals("links");
                case "line":
                    return this.getUIEVals("lines");
                case "box":
                    return this.getUIEVals("boxes");
                case "create-form":
                case "form":
                    return this.getUIEVals("forms");
            }

            return this.getUIEVals("texts");
        },

        getBaseClass: function (type) {
            if(this.has(type)) {
                return this.get(type).first().get('class_name');
            }
            return null;
        },

        getBaseStyleOf: function(type) {

            if(this.has(type)) {
                return this.get(type).first();
            }

            if(this.has(this.rectifier(type))) {
                return this.get(this.rectifier(type)).first();
            }

            return null;
        },

        rectifier: function (falseType) {
            switch(falseType) {
                case "button":
                    return "buttons";
                case "header":
                    return "headerTexts";
                case "image":
                    return "images";
                case "text":
                    return "texts";
                case "link":
                    return "links";
                case "line":
                    return "lines";
                case "box":
                    return "boxes";
                case "form":
                    return "forms";
            }

            return null;
        },

        serialize: function() {
            var json = _.clone(this.attributes);

            json["buttons"] = this.get('buttons').serialize();
            json["images"] = this.get('images').serialize();
            json["headerTexts"] = this.get('headerTexts').serialize();
            json["texts"] = this.get('texts').serialize();
            json["links"] = this.get('links').serialize();
            json["textInputs"] = this.get('textInputs').serialize();
            json["passwords"] = this.get('passwords').serialize();
            json["textAreas"] = this.get('textAreas').serialize();
            json["lines"] = this.get('lines').serialize();
            json["dropdowns"] = this.get('dropdowns').serialize();
            json["boxes"] = this.get('boxes').serialize();
            json["forms"] = this.get('forms').serialize();
            json["lists"] = this.get('lists').serialize();
            json["fonts"] = this.get('fonts').serialize();

            return json;
        }

    });

    exports.ThemeModel = ThemeModel;

});

require.define("/collections/UIElementCollection.js",function(require,module,exports,__dirname,__filename,process,global){var UIElementModel = require('../models/UIElementModel').UIElementModel;

  var UIElementCollection = Backbone.Collection.extend({
    model : UIElementModel,

    initialize: function (models, type) {
      this.type = type;
    }
  });

  exports.UIElementCollection = UIElementCollection;

});

require.define("/models/UIElementModel.js",function(require,module,exports,__dirname,__filename,process,global){  var UIElementModel = Backbone.Model.extend({
    initialize: function(bone) {

      this.set('style', bone.style||'');
      this.set('hoverStyle', bone.hoverStyle||'');
      this.set('activeStyle', bone.activeStyle||'');

    }
  });

  exports.UIElementModel = UIElementModel;
});

require.define("/mixins/BackboneConvenience.js",function(require,module,exports,__dirname,__filename,process,global){        Backbone.View.prototype.close = function() {

            this.undelegateEvents();
            this.$el.removeData().unbind();
            this.remove();
            this.unbind();

            if (this.subviews) {
                _(this.subviews).each(function(subview) {
                    subview.close();
                });
                this.subviews = null;
            }
        };

        Backbone.View.prototype._ensureElement = function() {
            if (!this.el) {
                var attrs = {};
                if (this.id) attrs.id = _.result(this, 'id');
                if (this.className) attrs['class'] = _.result(this, 'className');
                var $el = Backbone.$('<' + _.result(this, 'tagName') + '>').attr(attrs);
                this.setElement($el, false);
            } else {
                this.setElement(_.result(this, 'el'), false);
            }

            if (this.css) {
                util.loadCSS(this.css);
            }
        };

        Backbone.isModel = function(obj) {
            if (obj && obj.attributes) return true;
            return false;
        };

        Backbone.isCollection = function(obj) {
            if (obj && obj.models) return true;
            return false;
        };

        Backbone.isString = function(obj) {
            return toString.call(obj) == '[object String]';
        };

        Backbone.View.prototype.deepListenTo = function(obj, event, handler) {
            if (Backbone.isModel(obj)) {
                this.listenTo(obj, event, handler);
                _.each(obj.attributes, function(val, key) {
                    this.deepListenTo(val, event, handler);
                }, this);
            } else if (Backbone.isCollection(obj)) {
                this.listenTo(obj, event, handler);
                _.each(obj.models, function(model) {
                    this.deepListenTo(model, event, handler);
                }, this);
            }
        };

        Backbone.View.prototype.listenToModels = function(coll, event, handler) {

            coll.each(function(model) {
                this.listenTo(model, event, function() {
                    handler(model);
                });
            }, this);

            var self = this;
            this.listenTo(coll, 'add', function(model) {
                self.listenTo(model, event, handler);
            });
        };

        Backbone.View.prototype.createSubview = function(cls, data) {

            var view = new cls(data);
            view.superview = this;
            this.subviews = this.subviews || [];
            this.subviews.push(view);

            if(this.topview) { view.topview = this.topview; }

            return view;
        };

        Backbone.Collection.prototype.add = function(models, options) {
            /* make things validate by default*/
            models = _.isArray(models) ? models : [models];
            options = _.extend({
                validate: true
            }, options);
            var dupes = [];
            var addOptions = {
                add: true,
                merge: false,
                remove: false
            };

            if (this.uniqueKeys) {
                if (!_.isArray(models)) models = models ? [models] : [];

                _.each(models, function(model) {
                    this.each(function(_model) {
                        var dupe = null;
                        _.each(this.uniqueKeys, function(key) {
                            var _modelVal = _model.attributes ? _model.get(key) : _model[key];
                            if (_modelVal === model.get(key) ||
                                (Backbone.isString(_modelVal) && Backbone.isString(model.get(key)) &&
                                    _modelVal.toLowerCase() === model.get(key).toLowerCase()
                                )) {
                                dupe = model;
                                this.trigger('duplicate', key, model.get(key));
                                return;
                            }
                        }, this);

                        if (dupe) {
                            dupes.push(dupe);
                            return;
                        }
                    }, this);

                }, this);
            }

            models = _.difference(models, dupes);

            return this.set(models, _.defaults(options || {}, addOptions));
        };

        Backbone.Collection.prototype.push = function(model, options) {
            model = this._prepareModel(model, options);
            var dupe = null;
            if (this.uniqueKeys) {

                this.each(function(_model) {

                    _.each(this.uniqueKeys, function(key) {

                        if (_model.get(key) === model.get(key)) {
                            dupe = _model;
                            this.trigger('duplicate', key, model.get(key));
                            return;
                        }
                    }, this);

                    if (dupe) {
                        return;
                    }
                }, this);
            }

            if (dupe) return dupe;

            this.add(model, _.extend({
                at: this.length
            }, options));
            return model;
        };

        Backbone.Model.prototype.setGenerator = function(generatorStr) {
            this.generate = generatorStr;
        };

        Backbone.Model.prototype.serialize = function(options) {
            var options = options || {};
            var json = {};
            var data = this.toJSON(options);

            if (this.generate) {
                json.generate = this.generate;
                json.data = data;
                if(options.generate) json.data.cid = this.cid;
            } else {
                json = data;
            }

            return json;
        };

        Backbone.Collection.prototype.setGenerator = function(generatorStr) {
            this.generate = generatorStr;
        };

        Backbone.Collection.prototype.serialize = function(options) {
            options = options || {};
            var json = {};

            var data = this.map(function(model) {
                return model.serialize(options);
            });

            if (this.generate) {
                json.generate = this.generate;
                json.data = data;
            } else {
                json = data;
            }

            return json;
        };

        Backbone.Model.prototype.expand = function(options) {
        	var options = options || {};
            if (this.generate && options.generate !== false) {
                var data = this.toJSON({ generate: true });
                data.cid = this.cid;
                return G.generate(this.generate, data);
            } else {
                return this.toJSON();
            }

            return null;
        };

        Backbone.Model.prototype.updateJSON = function(bone) {

            this.set(bone, {silent: true});

            _.each(this.attributes, function(val, key) {
                if(!bone[key]) {
                    this.unset(key, {silent: true});
                }
            }, this);

            this.trigger('change');
        };

        Backbone.Collection.prototype.expand = function() {

            if (this.generate) {
                var data = this.serialize({ generate: true });
                data = data.data;
                return G.generate(this.generate, data);
            } else {
                return this.toJSON();
            }

            return null;
        };

});

require.define("/main.js",function(require,module,exports,__dirname,__filename,process,global){var Generator = require('./Generator').Generator;
var AppModel = require('./models/AppModel').AppModel;
var RouteCollection = require('./collections/RouteCollection').RouteCollection;
var ThemeModel = require('./models/ThemeModel').ThemeModel;
require('./mixins/BackboneConvenience');

if (window) {

    window.onerror = function(){
        //alert("I\'m a bug, please squash me.");
    }

    if (!appState) throw "No appstate";


    /* Initialize v1State */
    window.v1State = new Backbone.Model();
    /* Global code generator for this app. */
    window.G = new Generator(function(){ return v1State.serialize().plugins; });
    v1State = new AppModel(appState);
    v1State.set('routes', new RouteCollection(appState.routes || []));

    /* Initialize v1UIEState */
    v1UIEState = new ThemeModel(uieState);

    /* Help with debugging */
    v1State.on('error', function(message) {
        alert(message);
    });

    /* Track key/mouse events */
    g_guides = {};
    keyDispatcher = new KeyDispatcher();
    mouseDispatcher = new MouseDispatcher();


    v1 = {};
    v1 = new AppRouter();

    routeLogger = new RouteLogger({
        router: v1
    });

    // on appstate saves, synchronize version ids

    Backbone.history.start({
        pushState: true
    });

    // handle all click events for routing
    $(document).on('click', 'a[rel!="external"]', function(e) {
        var href = e.currentTarget.getAttribute('href') || "";
        var appId = appId || {};
        // if internal link, navigate with router
        if (appId && href.indexOf('/app/' + appId + '/') == 0) {
            v1.navigate(href, {
                trigger: true
            });
            return false;
        }
    });

}

});
require("/main.js");
})();

