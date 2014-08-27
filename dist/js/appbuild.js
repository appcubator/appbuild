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

require.define("/Generator.js",function(require,module,exports,__dirname,__filename,process,global){'use strict';

var Generator = function (pluginsGetter) {
    /* Pass either an object of the plugins to use, or pass a function which when called returns the plugins. */
    this.expander = initExpander();
    var expander = this.expander;

    if (typeof (pluginsGetter) === 'function') {
        this._getPlugins = pluginsGetter;
    } else {
        this._getPlugins = function () {
            return pluginsGetter;
        };
    }

    var self = this;

    this.expander.expandOnce = function (generators, genData) {

        var obj = {};
        try {
            var genID = this.parseGenID(genData.generate);
            var generatedObj = expander.constructGen(expander.findGenData(generators, genID))(generators, genData.data);
            obj = generatedObj;
        } catch (e) {
            console.log('Error in call to expandOnce for ' + JSON.stringify(genID, null, 3) + ':');
            console.log(e);
            throw e;
        }

        if (obj.html && genData.data && genData.data.cid) {

            var div = document.createElement('div');
            div.innerHTML = obj.html;
            var elements = div.childNodes;
            var element = div;

            if (elements.length == 1) {
                element = elements[0];
            }

            element.dataset.cid = genData.data.cid;
            element.setAttribute('data-cid', genData.data.cid);
            obj.html = div.innerHTML;
        }

        return obj;
    }

};

Generator.prototype.generate = function (generatorPath, data) {
    var plugins = this._getPlugins();
    return this.expander.expand(plugins, {
        generate: generatorPath,
        data: data
    });
};

Generator.prototype.getGenerator = function (generatorPath) {
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

        initialize: function (aState) {
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

        getTableModelWithName: function (nameStr) {
            var tableM = this.get('models').getTableWithName(nameStr);
            return tableM;
        },

        getTableModelWithCid: function (cid) {
            var tableM = this.get('models').get(cid);
            return tableM;
        },

        lazySet: function (key, coll) {
            this.lazy[key] = coll;
            this.set(key, new Backbone.Collection([]));
        },

        get: function (key) {
            if (this.lazy[key]) {
                this.set(key, this.lazy[key]);
                delete this.lazy[key];
            }

            return AppModel.__super__.get.call(this, key);
        },

        serialize: function (options) {
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
      initialize: function (bone) {
          // this.set("name", bone.name);
          this.set("description", bone.description || "");
          this.set("keywords", bone.keywords || "");
      }
  });

  exports.AppInfoModel = AppInfoModel;

});

require.define("/collections/NodeModelCollection.js",function(require,module,exports,__dirname,__filename,process,global){'use strict';

var NodeModelModel = require('../models/NodeModelModel').NodeModelModel;

var NodeModelCollection = Backbone.Collection.extend({
    model: NodeModelModel,
    uniqueKeys: ["name"],

    createTableWithName: function (nameStr) {
        return this.push({
            name: nameStr
        });
    },

    getTableWithName: function (tableNameStr) {
        var table = this.where({
            name: tableNameStr
        })[0];
        return table;
    },

    getRelationsWithEntityName: function (tableNameStr) {
        var arrFields = [];
        this.each(function (table) {
            table.get('fields').each(function (fieldModel) {
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

    getAllRelations: function () {
        return this.reduce(function (memo, model) {
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

        initialize: function (bone) {

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

            if (!this.generate) {
                this.setGenerator("models.model");
            }

            this.isUser = false;
        },

        toJSON: function () {
            var json = {};
            json = _.clone(this.attributes);
            json.fields = this.get('fields').serialize();
            json.functions = json.functions.serialize();
            return json;
        },

        addFieldsWithNames: function (nameArr) {
            _(nameArr).each(function (name) {
                this.get('fields').push({
                    name: name
                });
            }, this);
        },

        getFieldsColl: function () {
            var arr = this.get('fields');
            return arr;
        },

        getNormalFields: function () {
            var normalFields = this.get('fields').filter(function (field) {
                return !field.isRelatedField();
            });
            return normalFields;
        },

        getRelationalFields: function () {
            var relationalFields = this.get('fields').filter(function (field) {
                return field.isRelatedField();
            });
            return relationalFields;
        },

        hasMoneyField: function () {
            return (this.getMoneyField() !== null);
        },

        getMoneyField: function () {
            var moneyField = null;
            this.getFieldsColl().each(function (_fieldM) {
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

require.define("/collections/FieldsCollection.js",function(require,module,exports,__dirname,__filename,process,global){  var FieldModel = require('../models/FieldModel').FieldModel;

  var FieldsCollection = Backbone.Collection.extend({
      model: FieldModel,
      uniqueKeys: ["name"],
      getImageFields: function () {
          return this.filter(function (fieldM) {
              return fieldM.get('type') == "image";
          });
      }
  });

  exports.FieldsCollection = FieldsCollection;

});

require.define("/models/FieldModel.js",function(require,module,exports,__dirname,__filename,process,global){var FieldModel = Backbone.Model.extend({
    defaults: {
        "name": "Property Name",
        "type": "String"
    },

    // return a string version of the relationship
    getNLType: function () {
        var type = this.get('type');

        if (type == "o2o" || type == "fk") {
            return "Has one " + this.get('entity_name');
        }
        if (type == "m2m") {
            return "List of " + this.get('entity_name');
        }

        var nlType = this.nlTable[type];

        return nlType;
    },

    isRelatedField: function () {
        var type = this.get('type');
        return (type == "o2o" || type == "fk" || type == "m2m");
    },

    // return the relationship type
    getNL: function () {
        var type = this.get('type');

        // if(type == "o2o"){
        //   return
        // } || type == "fk") {
        //   return this.get('entity_name');
        // }
        // if(type == "m2m") {
        //   return "List of " + this.get('entity_name');
        // }

        // var nlType = this.nlTable[type];

        // return nlType;
    },

    // since o2m relationships are stored in the other entity as an fk,
    // find entities which relate to this model with an fk
    getOneToManyRelationships: function () {
        var self = this;
        var otherEntities = Array.prototype.concat.apply(v1State.get('tables').models, v1State.get('users').models);
        otherEntities = _.without(otherEntities, this);
        return _.filter(otherEntities, function (entity) {
            return (entity.get('type') === 'fk' && entity.get('entity_name') == self.get('name'));
        });
    },

    validate: function () {
        var valid = true;
        var name = this.get('name');
        if (!util.isAlphaNumeric(name) || util.doesStartWithKeywords(name)) {
            return false;
        }
    },

    nlTable: {
        "text": 'Text',
        "number": 'Number',
        "email": 'Email',
        "image": 'Image',
        "date": 'Date',
        "file": 'File'
    }

});

exports.FieldModel = FieldModel;

});

require.define("/models/NodeModelMethodModel.js",function(require,module,exports,__dirname,__filename,process,global){    var WhereCollection = require('../collections/WhereCollection');
    var Generator = require('../Generator');


    var NodeModelMethodModel = Backbone.Model.extend({
        /* Note that this may have name/code or it may be a generator */

        isGenerator: function () {
            return this.generate !== undefined;
        },

        getGenerated: function () {
            // TODO stop making objects of Generator every time
            if (this.isGenerator()) {
                return G.generate(this.generate, this.toJSON());
            } else {
                return this.serialize();
            }
        },

        getCode: function () {
            if (this.isGenerator()) {
                return String(G.generate(this.generate, this.toJSON()).code);
            } else {
                return this.get('code');
            }
        },

        /* mutating the type */
        getType: function () {
            var obj = this.getGenerated();
            if (obj.instancemethod)
                return 'instancemethod';
            else if (obj.enableAPI)
                return 'enableAPI';
            else
                return 'staticmethod';
        },
        setType: function (type) {
            if (this.isGenerator()) {
                alert('cant set type of a plugin\'s function');
                return;
            }
            var enableAPI = type === 'enableAPI' ? true : undefined;
            var instancemethod = type === 'instancemethod' ? true : undefined;
            this.set('enableAPI', enableAPI, {
                silent: true
            }); // only need to fire one change event
            this.set('instancemethod', instancemethod);
        },
        toggleType: function () {
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
        this.each(function (clause) {
            if (clause.get('field_name') == keyStr) {
                this.remove(clause);
            }
        });
    }
});

exports.WhereCollection = WhereCollection;

});

require.define("/models/WhereModel.js",function(require,module,exports,__dirname,__filename,process,global){  var WhereModel = Backbone.Model.extend({
      initialize: function (bone) {}
  });

  exports.WhereModel = WhereModel;

});

require.define("/collections/TemplateCollection.js",function(require,module,exports,__dirname,__filename,process,global){var TemplateModel = require('../models/TemplateModel').TemplateModel;

var TemplateCollection = Backbone.Collection.extend({
    model: TemplateModel,

    getTemplateWithName: function (name) {
        var page = null;

        this.each(function (templateModel) {
            if (templateModel.get('name') == name) {
                page = templateModel;
            }
        });

        return page;
    }
});

exports.TemplateCollection = TemplateCollection;

});

require.define("/models/TemplateModel.js",function(require,module,exports,__dirname,__filename,process,global){'use strict';

var SectionCollection = require('../collections/SectionCollection').SectionCollection;

var TemplateModel = Backbone.Model.extend({

    initialize: function (bone) {
        this.set('name', bone.name);
        this.set('head', bone.head || "");
        this.set('uielements', new SectionCollection(bone.uielements || []));

        if (!this.generate) {
            this.setGenerator('templates.page');
        }
    },

    getSections: function () {
        return this.get('uielements');
    },

    getUIElements: function () {
        if (this.widgetsCollection) return this.widgetsCollection;

        var WidgetCollection = require('../collections/WidgetCollection').WidgetCollection;
        var sections = this.getSections();
        this.widgetsCollection = new WidgetCollection();

        sections.each(function (sectionModel) {
            this.widgetsCollection.add(sectionModel.getWidgetsCollection().models);
            // this.bindColumn(columnModel);
        }, this);

        //this.get('columns').on('add', this.bindColumn);

        return this.widgetsCollection;

    },

    toJSON: function (options) {

        var json = _.clone(this.attributes);
        json.uielements = json.uielements.serialize(options);
        return json;
    }
});

exports.TemplateModel = TemplateModel;

});

require.define("/collections/SectionCollection.js",function(require,module,exports,__dirname,__filename,process,global){'use strict';
var SectionModel = require('../models/SectionModel').SectionModel;
var WidgetCollection = require('./WidgetCollection').WidgetCollection;
var ColumnModel = require('../models/ColumnModel').ColumnModel;

var SectionCollection = Backbone.Collection.extend({

    model: SectionModel,

    initialize: function () {
        Backbone.Regrettable.bind(this);

        if (!this.generate) {
            this.setGenerator('templates.layoutSections');
        }
    },

    createSectionWithType: function (type) {

        switch (type) {

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

            _.each(sectionsLayouts, function (columnLayout) {
                var columnM = new ColumnModel();
                columnM.set('layout', columnLayout);
                sectionModel.get('columns').push(columnM);
            }, this);

            this.add(sectionModel);
            return;
            break;
        }

    },

    getAllWidgets: function (argument) {
        if (!this.allWidgets) this.allWidgets = this.constructWidgetCollection();
        return this.allWidgets;
    },

    arrangeSections: function (fromInd, toInd) {
        this.models.splice(toInd, 0, this.models.splice(fromInd, 1)[0]);
        this.trigger('rearranged');
    },

    constructWidgetCollection: function () {
        var widgetCollection = new WidgetCollection();

        this.each(function (sectionModel) {
            if (!sectionModel.has('columns')) return;
            var collection = sectionModel.get('columns');
            collection.each(function (columnModel) {

                var widgetColl = columnModel.get('uielements');
                widgetCollection.add(widgetColl.models);
                widgetColl.on('add', function (model) {
                    widgetCollection.add(model);
                });

            });
        }, this);

        this.on('add', function (sectionModel) {
            if (!sectionModel.has('columns')) return;

            var collection = sectionModel.get('columns');
            collection.each(function (columnModel) {

                var widgetColl = columnModel.get('uielements');
                widgetCollection.add(widgetColl.models);
                widgetColl.on('add', function (model) {
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

require.define("/models/SectionModel.js",function(require,module,exports,__dirname,__filename,process,global){'use strict';

var WidgetCollection = require('../collections/WidgetCollection').WidgetCollection;
var ColumnModel = require('../models/ColumnModel').ColumnModel;

var SectionModel = Backbone.Model.extend({

    initialize: function (bone) {

        var bone = bone || {};

        if (bone.columns) {
            var ColumnCollection = Backbone.Collection.extend({
                model: ColumnModel
            });
            var columnsColl = new ColumnCollection();
            columnsColl.add(bone.columns || []);
            this.set("columns", columnsColl);
        }

        if (!this.generate) {
            this.generate = "templates.layoutSection";
        }
    },

    setupColumns: function () {
        var ColumnCollection = Backbone.Collection.extend({
            model: ColumnModel
        });
        var columnsColl = new ColumnCollection();
        this.set("columns", columnsColl);
    },

    updateJSON: function (bone) {

        var cleanBone = _.omit(bone, ['layout', 'data', 'context', 'fields']);
        this.set(cleanBone);

        if (bone.columns) {
            var ColumnCollection = Backbone.Collection.extend({
                model: ColumnModel
            });
            var columnsColl = new ColumnCollection();
            columnsColl.add(bone.columns || []);
            this.set("columns", columnsColl);
        }

        _.each(this.attributes, function (val, key) {
            if (!bone[key]) {
                this.unset(key);
            }
        }, this);

    },

    getWidgetsCollection: function () {
        if (this.widgetsCollection) {
            return this.widgetsCollection;
        }

        this.widgetsCollection = new Backbone.Collection();

        if (this.has('columns')) {

            this.get('columns').each(function (columnModel) {
                this.widgetsCollection.add(columnModel.get('uielements').models);
                columnModel.get('uielements').each(function (widgetModel) {
                    widgetModel.collection = columnModel.get('uielements');
                });
                this.bindColumn(columnModel);
            }, this);
            this.get('columns').on('add', this.bindColumn);
        }


        return this.widgetsCollection;
    },

    bindColumn: function (columnModel) {

        columnModel.get('uielements').on('remove', function (widgetModel) {
            this.widgetsCollection.remove(widgetModel, columnModel);
        }, this);

        columnModel.get('uielements').on('add', function (widgetModel) {
            this.widgetsCollection.add(widgetModel, columnModel);
        }, this);

    },

    toJSON: function (options) {
        var options = options || {};
        var json = _.clone(this.attributes);
        if (json.columns) {
            json.columns = json.columns.serialize(options);
        }
        return json;
    }
});

exports.SectionModel = SectionModel;

});

require.define("/collections/WidgetCollection.js",function(require,module,exports,__dirname,__filename,process,global){'use strict';

var WidgetModel = require("../models/WidgetModel").WidgetModel;
var Generator = require("../Generator").Generator;

var WidgetCollection = Backbone.Collection.extend({

    model: WidgetModel,

    initialize: function () {
        Backbone.Regrettable.bind(this);
    },

    createElementWithGenPath: function (layout, generatorPath, type, extraData) {
        this.createUIElement(type, layout, generatorPath, extraData);
    },

    createUIElement: function (type, layout, generatorPath, extraData) {
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

require.define("/models/WidgetModel.js",function(require,module,exports,__dirname,__filename,process,global){'use strict';

var LayoutModel = require('./LayoutModel').LayoutModel;
var FormFieldCollection = require('../collections/FormFieldCollection').FormFieldCollection;

var WidgetModel = Backbone.Model.extend({
    selected: false,
    editMode: false,
    /* idAttribute as cid allows duplicate widgets to be stored in the collection */
    idAttribute: 'cid',

    initialize: function (bone, isNew) {

        if (bone.layout) {
            this.set('layout', new LayoutModel(bone.layout || {}));
        }

        this.set('context', new Backbone.Collection(bone.context || []));

        if (bone.fields) {
            this.set('fields', new FormFieldCollection(bone.fields || []));
        }
        if (bone.row) {
            var RowModel = require('../models/RowModel');
            this.set('row', new RowModel(bone.row || {}));
        }

        this.bind('editModeOn', function () {
            this.editMode = true;
        }, this);
        this.bind('editModeOff', function () {
            this.editMode = false;
        }, this);

    },

    updateJSON: function (bone) {

        var cleanBone = _.omit(bone, ['data', 'layout', 'fields']);
        this.set(cleanBone, {
            silent: true
        });

        if (this.has('layout') && bone.layout) {
            console.log(bone.layout);
            this.get('layout').set(bone.layout, {
                silent: true
            });
        }

        if (this.has('fields') && bone.fields) {
            this.get('fields').set(bone.fields, {
                silent: true
            });
        }

        _.each(this.attributes, function (val, key) {
            if (!bone[key]) {
                this.unset(key, {
                    silent: true
                });
            }
        }, this);

        this.trigger('change');
    },

    remove: function () {
        if (this.get('deletable') === false) return;
        if (this.collection) {
            this.collection.remove(this);
        }
    },

    isFullWidth: function () {
        return this.get('layout').get('isFull') === true;
    },

    moveLeft: function () {
        if (this.isFullWidth()) return;

        if (this.get('layout').get('left') < 1 || this.collection.editMode) return;
        this.get('layout').set('left', this.get('layout').get('left') - 1);
    },

    moveRight: function () {
        if (this.isFullWidth()) return;

        var maxWidth = this.collection.grid.maxWidth;
        if (maxWidth && this.get('layout').get('left') + this.get('layout').get('width') > (maxWidth - 1)) return;
        this.get('layout').set('left', this.get('layout').get('left') + 1);
    },

    moveUp: function () {
        if (this.get('layout').get('top') < 1 || this.collection.editMode) return;
        this.get('layout').set('top', this.get('layout').get('top') - 1);
    },

    moveDown: function () {
        if (this.collection.editMode) return;
        this.get('layout').set('top', this.get('layout').get('top') + 1);
    },

    setupPageContext: function (pageModel) {
        // TODO: Fix this
        //var entityList = pageModel.getContextEntities();
        var entityList = [];
        var contextList = this.get('context');

        _(entityList).each(function (entity) {
            contextList.push({
                entity: entity,
                context: 'Page.' + entity
            });
        });

        return this;
    },

    setupLoopContext: function (entityModel) {
        var newContext = {
            entity: entityModel.get('name'),
            context: 'loop.' + entityModel.get('name')
        };
        var isUnique = true;

        this.get('context').each(function (context) {
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

    getAction: function () {
        if (this.get('data').has('container_info')) return this.get('data').get('container_info').get('action');
        else return this.get('data').get('action');

        return;
    },

    getRow: function () {
        if (!this.has('row')) return null;
        return this.get('row');
    },

    getContent: function () {
        return this.get('content');
    },

    getForm: function () {
        if (!this.get('data').has('container_info')) return null;
        return this.get('data').get('container_info').get('form');
    },

    hasForm: function () {
        if (this.has('fields')) return true;
        return false;
    },

    getLoginRoutes: function () {

        if (this.get('data').has('loginRoutes')) {
            return this.get('data').get('loginRoutes');
        }

        if (this.get('data').has('container_info') &&
            this.get('data').get('container_info').has('form')) {
            return this.get('data').get('container_info').get('form').get('loginRoutes');
        }

        return null;
    },


    getSearchQuery: function () {
        return this.get('data').get('searchQuery');
    },

    isNode: function () {
        return this.get('type') == "node";
    },

    isImage: function () {
        return (this.isNode() && this.get('data').get('nodeType') == "images");
    },

    isBox: function () {
        return (this.isNode() && this.get('data').get('nodeType') == "boxes");
    },

    isBgElement: function () {
        if ((this.get('type') == "node" && this.get('data').get('nodeType') == "boxes") ||
            (this.get('type') == "imageslider")) return true;
        return false;
    },

    isForm: function () {
        return this.get('type') == "form";
    },

    isLoginForm: function () {
        return false;
        //return (this.isForm() && this.get('data').get('container_info').get('action') == "login") || (this.get('type') == "thirdpartylogin");
    },

    isList: function () {
        if (this.get('type') == "loop") return true;
        return false;
    },

    isCustomWidget: function () {
        if (this.get('type') == "custom" ||
            this.get('data').has('cssC') ||
            this.get('data').has('jsC') ||
            this.get('data').has('htmlC')) return true;
    },

    isBuyButton: function () {
        return this.get('type') === "buybutton";
    },

    isSearchList: function () {
        return this.get('data').has('container_info') && this.get('data').get('container_info').get('action') == "searchlist";
    },

    getBottom: function () {
        return this.get('layout').get('height') + this.get('layout').get('top');
    },

    getWidgetsCollection: function () {
        if (this.widgetsCollection) return this.widgetsCollection;
        var WidgetCollection = require('../collections/WidgetCollection');
        this.widgetsCollection = new WidgetCollection();

        this.get('row').get('columns').each(function (columnModel) {
            this.widgetsCollection.add(columnModel.get('uielements').models);
            this.bindColumn(columnModel);
        }, this);

        this.get('row').get('columns').on('add', this.bindColumn);

        return this.widgetsCollection;
    },


    bindColumn: function (columnModel) {

        columnModel.get('uielements').on('remove', function (widgetModel) {
            this.widgetsCollection.remove(widgetModel, columnModel);
        }, this);

        columnModel.get('uielements').on('add', function (widgetModel) {
            this.widgetsCollection.add(widgetModel, columnModel);
        }, this);

    },

    toJSON: function (options) {
        options = options || {};

        var json = _.clone(this.attributes);
        json = _.omit(json, 'selected', 'deletable', 'context');

        if (json.layout) {
            json.layout = this.get('layout').serialize(options);
        }
        if (json.fields) {
            json.fields = json.fields.serialize(options);
        }
        // if (json.row) { json.row = json.row.serialize(options); }
        if (json.context) delete json.context;

        return json;
    },

    safeExpand: function () {
        try {
            return this.expand();
        } catch (e) {
            console.log("Expander error:");
            console.log(e);
            return {
                html: '<img src="http://cdn.memegenerator.net/instances/500x/43563104.jpg">',
                js: '',
                css: ''
            };
        }
    }

});

exports.WidgetModel = WidgetModel;

});

require.define("/models/LayoutModel.js",function(require,module,exports,__dirname,__filename,process,global){var LayoutModel = Backbone.Model.extend({

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
            initialize: function (bone) {
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

            toJSON: function () {
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

        initialize: function (bone) {

            var columnCollection = Backbone.Collection.extend({
                model: ColumnModel
            });

            var columnsColl = new columnCollection();
            columnsColl.add(bone.columns || []);
            this.set("columns", columnsColl);

        },

        toJSON: function (options) {
            var json = _.clone(this.attributes);
            if (json.columns) json.columns = json.columns.serialize(options);

            return json;
        }

    });

    exports.RowModel = RowModel;

});

require.define("/models/ColumnModel.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';
    var WidgetCollection = require('../collections/WidgetCollection').WidgetCollection;

    var ColumnModel = Backbone.Model.extend({

        initialize: function (bone) {
            var bone = bone || {};
            this.set("uielements", new WidgetCollection(bone.uielements || []));

            if (!this.generate) {
                this.generate = "templates.layoutColumn";
            }

            Backbone.Regrettable.bind(this);
        },

        addElement: function (type, extraData) {
            var layout = {};
            this.get('uielements').createElement(layout, className, id);
        },

        addElementWithPath: function (type, generatorPath, extraData) {
            var layout = {};
            this.get('uielements').createElementWithGenPath(layout, generatorPath, type, extraData);
        },

        toJSON: function (options) {
            options = options || {};

            var json = _.clone(this.attributes);
            json.uielements = json.uielements.serialize(options);
            if (options.generate) {
                json.cid = this.cid;
            }
            return json;
        }
    });

    exports.ColumnModel = ColumnModel;

});

require.define("/models/PluginsModel.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var PluginModel = require('./PluginModel').PluginModel;
    var NodeModelMethodModel = require('./NodeModelMethodModel').NodeModelMethodModel;

    /* Contains metadata and convenience methods for Plugins */
    var PluginsModel = Backbone.Model.extend({

        initialize: function (bone) {

            _.each(bone, function (val, key) {

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
        getAllPlugins: function () {

            var plugins = {};
            plugins = _.extend(plugins, _.clone(this.attributes)); // pluginName : pluginModel object

            /* Start with local plugins and merge builtin plugins in, not overwriting local plugins. */

            _.each(G.expander.builtinGenerators, function (builtInPlugin, pluginName) {
                var pluginModel = new PluginModel(builtInPlugin);

                if (!plugins[pluginName]) {
                    plugins[pluginName] = pluginModel;
                } else {
                    /* User might have forked a generator from a builtin plugin */
                    var localCopy = new PluginModel();

                    // app-state copy of the package 
                    _.each(plugins[pluginName].attributes, function (val, key) {
                        localCopy.set(key, _.clone(val));
                    });

                    // iterating over the builtin ones and mergins the gens
                    _.each(builtInPlugin, function (gens, moduleName) {
                        if (moduleName === 'metadata')
                            return;
                        if (!localCopy.has(moduleName)) {
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

        getAllPluginsSerialized: function () {
            var plugins = this.getAllPlugins();
            var serializedPlugins = {};

            _.each(plugins, function (val, key) {
                serializedPlugins[key] = val.serialize();
            });

            return util.deepCopy(serializedPlugins);
        },

        install: function (plugin) {
            if (!plugin.metadata || !plugin.metadata.name)
                alert('not installing because this plugin doesn\'t have metadata.');
            var pluginModel = new PluginModel(plugin);
            this.set(plugin.metadata.name, pluginModel);
        },

        uninstall: function (pluginName) {
            this.unset(pluginName);
            // TODO do something about generator references to this plugin?
        },

        getPluginsWithModule: function (moduleName) {
            return _.filter(this.getAllPlugins(), function (pluginModel, pluginName) {
                pluginModel.name = pluginName;
                return pluginModel.has(moduleName);
            });
        },

        getAllPluginsWithModule: function (moduleName) {
            var plugins = this.getAllPlugins();
            return _.filter(plugins, function (pluginModel) {
                return pluginModel.has(moduleName);
            });
        },

        getGeneratorsWithModule: function (generatorModule) {
            var generators = _.flatten(_.map(this.getAllPlugins(), function (pluginModel, packageName) {
                return pluginModel.getGensByModule(generatorModule);
            }));

            return generators;
        },

        getAllGeneratorsWithModule: function (moduleName) {
            var plugins = this.getAllPluginsWithModule(moduleName);
            plugins = _.filter(plugins, function (pluginModel, key) {
                return pluginModel.has(moduleName);
            });

            var generators = _.flatten(_.map(plugins, function (pluginModel) {
                var gens = pluginModel.get(moduleName);
                _.each(gens, function (gen) {
                    gen.package = pluginModel.getName();
                });
                return gens;
            }));

            return generators;
        },

        isPluginInstalledToModel: function (pluginModel, nodeModelModel) {
            var gens = pluginModel.getGensByModule('model_methods');
            var genNames = _.map(gens, function (g) {
                return pluginModel.getName() + '.model_methods.' + g.name;
            });
            var functions = nodeModelModel.get('functions').map(function (fn) {
                return fn.generate;
            });
            return _.intersection(genNames, functions).length > 0 ? true : false;
        },

        installPluginToModel: function (pluginModel, nodeModelModel) {
            if (!pluginModel) {
                alert('yo, what are you doing.');
                return;
            }
            var gens = pluginModel.getGensByModule('model_methods');

            _.each(gens, function (gen) {
                var methodModel = new NodeModelMethodModel();
                var genIDStr = pluginModel.getName() + '.model_methods.' + gen.name;
                methodModel.setGenerator(genIDStr);
                methodModel.set('modelName', nodeModelModel.get('name'));
                methodModel.set('name', gen.name);
                nodeModelModel.get('functions').push(methodModel);
            });
        },

        uninstallPluginToModel: function (plugin, nodeModelModel) {
            var gens = [];

            nodeModelModel.get('functions').each(function (fn) {
                if (fn.isInPackage(plugin.getName())) {
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
                this.set(genID.package, new PluginModel({
                    metadata: {
                        name: genID.package
                    }
                }));
            }

            if (!this.get(genID.package).has(genID.module)) {
                // NOTE this only happens when builtin generator is forked
                this.get(genID.package).set(genID.module, []);
            }

            this.get(genID.package).get(genID.module).push(genObj);

            this.trigger('fork');

            return [genID.package, genID.module, genID.name].join('.');
        },

        assertWeHaveGenerator: function (generatorPath) {
            // ensures the plugin is either builin or in the app state
            // throws an error if for some reason the generatorPath refers to a nonexistant generator
            util.findGenerator(this.serialize(), generatorPath);
        },

        isGeneratorBuiltin: function (generatorPath) {
            this.assertWeHaveGenerator(generatorPath);

            var genID = util.packageModuleName(generatorPath);

            // no generator of this package has not been forked yet, it must be built in
            if (!this.has(genID.package)) {
                return false;
            }

            // let's try to find the generator in the app state.
            var localGen = _.find(this.get(genID.package).getGensByModule(genID.module), function (gen) {
                return gen.name === genID.name;
            });

            // expect it to not be found if it's builtin.
            return localGen === undefined;
        },

        isGeneratorEditable: function (generatorPath) {
            return !this.isGeneratorBuiltin(generatorPath);
        },

        isNameUnique: function (newPackageModuleName) {
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

        toJSON: function () {
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

        getName: function () {
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

require.define("/collections/RouteCollection.js",function(require,module,exports,__dirname,__filename,process,global){var RouteModel = require('../models/RouteModel').RouteModel;

var RouteCollection = Backbone.Collection.extend({

    model: RouteModel,
    uniqueKeys: ["name"],

    getRouteWithTemplate: function (templateModel) {

        var templateName = templateModel.get('name');
        var routeM = null;
        this.each(function (routeModel) {
            if (routeModel.get('name') == templateName) {
                routeM = routeModel;
            }
        });

        return routeM;
    },

    removePagesWithContext: function (tableM) {
        var arr = this.getPageModelsWithEntityName(tableM.get('name'));
        _.each(arr, function (pageM) {
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

            initialize: function (bone) {
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

            getUrlString: function () {
                return '/' + this.get('url').toJSON().join('/');
            },

            addToContext: function (tableM) {
                this.get('url').get('urlparts').push({
                    value: '{{' + tableM.get('name') + '}}'
                });
            },

            hasContext: function (tableM) {
                return this.doesContainEntityName(tableM.get('name'));
            },

            doesContainEntityName: function (entityName) {
                return _.contains(this.get('url').get('urlparts').pluck('value'), '{{' + entityName + '}}');
            },

            getContextEntities: function () {
                var entities = [];
                this.get('url').get('urlparts').each(function (urlPart) {
                    var part = urlPart.get('value');
                    if (/{{([^\}]+)}}/g.exec(part)) entities.push(/\{\{([^\}]+)\}\}/g.exec(part)[1]);
                });
                return entities;
            },

            getContextSentence: function () {
                var entities = [];
                this.get('url').get('urlparts').each(function (urlPart) {
                    if (/{{([^\}]+)}}/g.exec(urlPart.get('value'))) entities.push(/\{\{([^\}]+)\}\}/g.exec(urlPart.get('value'))[1]);
                });

                if (entities.length === 0) {
                    return "";
                } else if (entities.length === 1) {
                    return "Page has a " + entities[0];
                } else {
                    var str = "Page has ";
                    _(entities).each(function (val, ind) {
                        if (ind == entities.length - 1) {
                            str += "and a " + val;
                        } else {
                            str += "a " + val + " ";
                        }
                    });

                    return str;
                }
            },

            getFields: function () {
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

            updatePageName: function (urlModel, newPageName) {
                this.set('page_name', newPageName);
            },

            getLinkLang: function (contextArgs) {
                var str = "internal://" + this.get('name');
                var entities = this.getContextEntities();
                if (entities.length) {
                    str += '/?' + entities[0] + '=' + this.getPageContextDatalang();
                }
                return str;
            },

            getDataLang: function () {
                var str = "internal://" + this.get('name');
                return str;
            },

            getPageContextDatalang: function () {
                var entities = this.getContextEntities();
                return "Page." + entities[0];
            },

            validate: function () {
                var valid = true;
                var name = this.get('name');
                if (!util.isAlphaNumeric(name) || util.doesStartWithKeywords(name)) {
                    return false;
                }
            },

            setupUrl: function (name) {
                name = name.toLowerCase().replace(/ /g, '_');
                name = name.replace(/[^a-zA-Z0-9\s]+/g, '_');
                var urlparts = {
                    value: name.toLowerCase().replace(/ /g, '_')
                };
                this.get('url').get('urlparts').reset([urlparts]);
            },

            isContextFree: function () {
                return (!this.get('url').get('urlparts').some(function (part) {
                    return (/\{\{([^\}]+)\}\}/g).test(part.get('value'));
                }));
            },

            hasSearchList: function (searchOn) {
                var hasSearchList = false;
                this.get('uielements').each(function (widgetM) {
                    if (widgetM.isSearchList() && widgetM.get('data').get('container_info').get('entity').get('name') == searchOn) {
                        hasSearchList = true;
                    }
                });
                return hasSearchList;
            },

            toJSON: function () {
                var json = _.clone(this.attributes);
                if (json.url) {
                    json.url = this.get('url').serialize();
                }
                // json.navbar = this.get('navbar').serialize();
                // json.footer = this.get('footer').serialize();
                // json.uielements = this.get('uielements').serialize();
                return json;
            }
        });

        exports.RouteModel = RouteModel;

});

require.define("/models/UrlModel.js",function(require,module,exports,__dirname,__filename,process,global){var UrlModel = Backbone.Model.extend({
    defaults: {},

    initialize: function (bone) {
        var urlparts = [];

        if (bone) {
            urlparts = _(bone).map(function (value) {
                return {
                    value: value
                };
            });
        }
        this.set('urlparts', new Backbone.Collection(urlparts));
    },

    getAppendixString: function () {
        return this.get('urlparts').pluck('value').join('/');
    },

    getUrlString: function (appSubdomain) {
        return (appUrl || 'http://yourapp.com') + this.getAppendixString();
    },

    addUrlPart: function (value) {
        this.get('urlparts').push(value);
    },

    removeUrlPart: function (value) {
        var value = this.get('urlparts').remove(value);
    },

    toJSON: function () {
        var json = this.get('urlparts').pluck('value');
        return json;
    }
});

exports.UrlModel = UrlModel;

});

require.define("/models/ThemeModel.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var UIElementCollection = require('../collections/UIElementCollection').UIElementCollection;

    var ThemeModel = Backbone.Model.extend({

        initialize: function (themeState) {
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

        getUIElementCollections: function () {

            return [this.get('buttons'), this.get('images'), this.get('headerTexts'),
                this.get('texts'), this.get('links'), this.get('textInputs'),
                this.get('passwords'), this.get('textAreas'), this.get('lines'),
                this.get('dropdowns'), this.get('boxes'), this.get('forms'),
                this.get('lists')
            ];
        },

        getStyleWithClassAndType: function (className, type) {
            var model = null;

            if (!this.has(type)) {
                type = this.rectifier(type);
                if (!this.has(type)) return null;
            }

            this.get(type).each(function (styleModel) {
                if (styleModel.get('class_name') == className) {
                    model = styleModel;
                }
            });

            return model;
        },

        getUIEVals: function (type) {

            if (this.has(type)) {
                return this.get(type);
            }

            switch (type) {
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
            if (this.has(type)) {
                return this.get(type).first().get('class_name');
            }
            return null;
        },

        getBaseStyleOf: function (type) {

            if (this.has(type)) {
                return this.get(type).first();
            }

            if (this.has(this.rectifier(type))) {
                return this.get(this.rectifier(type)).first();
            }

            return null;
        },

        rectifier: function (falseType) {
            switch (falseType) {
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

        serialize: function () {
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
    model: UIElementModel,

    initialize: function (models, type) {
        this.type = type;
    }
});

exports.UIElementCollection = UIElementCollection;

});

require.define("/models/UIElementModel.js",function(require,module,exports,__dirname,__filename,process,global){  var UIElementModel = Backbone.Model.extend({
      initialize: function (bone) {

          this.set('style', bone.style || '');
          this.set('hoverStyle', bone.hoverStyle || '');
          this.set('activeStyle', bone.activeStyle || '');

      }
  });

  exports.UIElementModel = UIElementModel;

});

require.define("/template_editor/KeyDispatcher.js",function(require,module,exports,__dirname,__filename,process,global){  var KeyDispatcher = function () {

      this.bindings = {};
      this.environments = [document];
      this.store = [];

      this.addEnvironment = function (env) {
          this.environments.push(env);
          this.initializeEnvironment(env);
      };

      this.bind = function (keyComb, fn, type) {
          _.each(this.environments, function (env) {
              $(env).bind('keydown', keyComb, fn);
          });
      };

      this.bindComb = function (keyComb, fn, type) {
          this.store.push({
              keyComb: keyComb,
              fn: fn,
              type: type
          });
          _.each(this.environments, function (env) {
              $(env).bind('keydown', keyComb, fn);
          });
      };

      this.unbind = function (keyComb, fn, type) {
          _.each(this.environments, function (env) {
              $(env).unbind('keydown', keyComb, fn);
          });
          this.removeFromStore(keyComb, fn, type);
      };

      this.removeFromStore = function (keyComb, fn, type) {
          var indToRemove = [];
          _.each(this.store, function (binding, ind) {
              if (binding.keyComb == keyComb && binding.fn == fn) {
                  intToRemove.push(ind);
              }
          });
      };

      this.initializeEnvironment = function (env) {
          _.each(this.store, function (binding) {
              $(env).bind('keydown', binding.keyComb, binding.fn);
          });
      };

  };

  exports.KeyDispatcher = KeyDispatcher;

});

require.define("/template_editor/MouseDispatcher.js",function(require,module,exports,__dirname,__filename,process,global){  var MouseDispatcher = function () {
      this.isMousedownActive = false;
  };

  exports.MouseDispatcher = MouseDispatcher;

});

require.define("/AppRouter.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var SimpleModalView = require("./mixins/SimpleModalView").SimpleModalView;
    var ErrorDialogueView = require("./mixins/ErrorDialogueView").ErrorDialogueView;
    var SimpleDialogueView = require("./mixins/SimpleDialogueView").SimpleDialogueView;
    var AppView = require("./AppView").AppView;

    var AppRouter = Backbone.Router.extend({

        routes: {
            "app/new/": "newapp",
            "app/:appid/info/*tutorial": "info",
            "app/:appid/tables/*tutorial": "tables",
            "app/:appid/gallery/*tutorial": "themes",
            "app/:appid/template/:pageid/": "appmain",
            "app/:appid/plugins/*tutorial": "plugins",
            "app/:appid/mobile-editor/:pageid/": "mobileEditor",
            "app/:appid/emails/*tutorial": "emails",
            "/": "appmain",
            "*anything": "appmain",
            "account": "accountPage",
        },

        tutorialPage: 0,

        initialize: function () {
            var self = this;
            v1.view = null;

            this.currentApp = null;
        },

        configApp: function () {
            if (this.currentApp) return;

            this.currentApp = new AppView({
                model: v1State,
                appId: appId
            });
            v1.view = this.currentApp;
        },

        shrinkDropdowns: function () {
            $(window).trigger("mouseup");
        },

        info: function (appId, tutorial) {
            v1.configApp();
            var self = this;
            v1.currentApp.info(tutorial);
        },

        tables: function (appId, tutorial) {
            v1.configApp();
            v1.currentApp.tables(tutorial);
        },

        themes: function (appId, tutorial) {
            v1.configApp();
            v1.currentApp.themes(tutorial);
        },

        pages: function (appId, tutorial) {
            v1.configApp();
            v1.currentApp.pages(tutorial);
        },

        appmain: function (appId, pageId) {
            v1.configApp();
            if (!pageId) pageId = 0;
            v1.currentApp.pageWithIndex(pageId);
        },

        emails: function (appId, tutorial) {
            v1.configApp();
            v1.currentApp.emails(tutorial);
        },

        plugins: function (appId, tutorial) {
            v1.configApp();
            //v1.currentApp.plugins(tutorial);
        },

        showTutorial: function (dir) {
            var inp = (dir) ? dir : this.tutorialPage;
            if (this.tutorialIsVisible) {
                this.tutorial.chooseSlide(inp);
            } else {
                this.tutorial = new TutorialView({
                    initial: inp
                });
                this.tutorialIsVisible = true;
            }
        },

        accountPage: function () {
            var PaymentsMain = function () {
                var striper = new Striper();
                striper.bindChangeCard('.change-card', 'change-card-form');
                striper.onSuccess = function () {
                    window.location = "/account/";
                };

                // striper.bindChangePlan('#change-plan-btn','change-subscription');
                striper.bindCancel('#cancel-btn', 'cancel-form');
            };

            $(document).ready(new PaymentsMain());


            this.$nav = $('.navigator .left-nav');

            // make left nav links scroll page
            this.$nav.find('a').click(function () {
                var elem = this.getAttribute('href');
                var topPos = $(elem).offset().top - 75;
                $('html,body').animate({
                    scrollTop: topPos
                });
                return false;
            });

            $('.left-nav').affix({
                offset: 0
            });

            $('#add-key-btn').on('click', function () {
                $('#add-key-btn').hide();
                $('#add-key-panel').fadeIn();
            });

            // @ksikka's code
            $(document).ready(function () {
                $('form').not('.no-ajax').each(function (ind, node) {
                    $(node).submit(function (e) {
                        var self = this;
                        var ajax_info = {
                            type: $(node).attr('method'),
                            url: $(node).attr('action'),
                            data: $(node).serialize(),
                            success: function (data, statusStr, xhr) {
                                if (typeof (data.redirect_to) !== 'undefined') {
                                    location.href = data.redirect_to;
                                } else {
                                    _.each(data, function (val, key, ind) {
                                        if (key === '__all__') {
                                            $(self).find('.form-error.field-all').html(val.join('<br />')).show();
                                        } else {
                                            $(self).find('.form-error.field-name-' + key).html(val.join('<br />')).show();
                                        }
                                    });
                                }
                            }
                        };
                        $.ajax(ajax_info);
                        $(self).find('.form-error').html("");
                        return false;
                    });
                });
            });
        },

        newapp: function () {

            $('#skip-racoon').hover(function () {
                $('#mascot').addClass('happy');
            }, function () {
                $('#mascot').removeClass('happy');
            });

        },

        dashboard: function () {
            console.log("DASHBOARD");

            var dboard = new DashboardsView();

            $(document).tooltip({
                position: {
                    my: "center bottom-10",
                    at: "center top",
                    using: function (position, feedback) {
                        $(this).css(position);
                        $("<div>")
                            .addClass("arrow")
                            .addClass(feedback.vertical)
                            .addClass(feedback.horizontal)
                            .appendTo(this);
                    }
                }
            });

        },

        changeTitle: function (title) {
            var newTitle = "";
            if (title) {
                newTitle = " | " + title;
            }
            document.title = "Appcubator" + newTitle;
        }

    });

    exports.AppRouter = AppRouter;

});

require.define("/mixins/SimpleModalView.js",function(require,module,exports,__dirname,__filename,process,global){  require('./BackboneModal');

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

});

require.define("/mixins/BackboneModal.js",function(require,module,exports,__dirname,__filename,process,global){  Backbone.ModalView = Backbone.View.extend({
      width: 500,
      padding: 30,

      bodyEl: null,

      events: {
          'click .modal-bg': 'closeModal',
          'keydown': 'handleKey',
          'click .done': 'closeModal'
      },

      _configure: function (options) {
          Backbone.ModalView.__super__._configure.call(this, options);
          if (options.height) {
              this.height = options.height;
          }
          this.bodyEl = document.body;
          this.backgroundDiv = this.setupModal();
          this.modalWindow = this.setupModalWindow();
          _.bindAll(this);
      },

      _ensureElement: function (options) {
          Backbone.ModalView.__super__._ensureElement.call(this, options);
      },

      setBodyEl: function (el) {
          this.bodyEl = el;
      },

      setupModal: function () {
          var self = this;
          var div = document.createElement('div');
          div.className = "modal-bg fadeIn";
          div.style.position = 'fixed';
          div.style.width = '100%';
          div.style.height = '100%';
          div.style.top = '0';
          div.style.left = '0';
          div.style.backgroundColor = '#222';
          div.style.opacity = '0.7';
          div.style.zIndex = 3000;
          this.bodyEl.appendChild(div);

          var closeHandler = function (e) {
              if (e.keyCode == 27) {
                  self.closeModal(closeHandler);
              }
          };

          $(div).on('click', function () {
              self.closeModal(closeHandler);
          });


          $(window).on('keydown', closeHandler);

          return div;
      },

      setupModalWindow: function () {
          var self = this;

          var div = document.createElement('div');
          div.style.position = 'fixed';
          div.className = 'modal ' + this.className;
          div.style.width = this.width + 'px';
          if (this.height) {
              div.style.height = this.height + 'px';
          } else {
              div.style.minHeight = '300px';
              div.style.maxHeight = '630px';
          }
          div.style.top = '50%';
          div.style.left = '50%';
          div.style.marginLeft = '-' + (this.width / 2) + 'px';
          div.style.marginTop = '-300px';
          div.style.zIndex = 3001;
          div.style.padding = 0;

          if (this.title) {
              var title = document.createElement('h3');
              title.innerText = this.title;
              div.appendChild(title);
          }
          if (this.doneButton) {
              var qMark = '';
              if (this.address) {
                  qMark = '<div class="q-mark"></div>';
              }
              $(div).append('<div class="bottom-sect">' + qMark + '<div class="btn done">Done</div></div>');
              $(div).find('.done').on('click', function () {
                  self.closeModal();
              });
          }

          var span = document.createElement('span');
          span.className = 'modal-cross';
          span.style.position = 'absolute';
          span.style.right = '15px';
          span.style.top = '15px';
          span.innerText = '×';
          span.style.zIndex = '1000';
          div.appendChild(span);

          var content = document.createElement('div');
          content.style.width = '100%';
          if (!this.title) content.style.height = (this.contentHeight || '100%');
          content.style.position = "relative";
          content.style.padding = (this.padding || 0) + 'px';
          div.appendChild(content);

          this.bodyEl.appendChild(div);

          $(span).on('click', function () {
              self.closeModal();
          });

          this.el = content;
          return div;
      },

      closeModal: function (closeHandlerFn) {
          var self = this;
          this.undelegateEvents();
          if (this.callback) this.callback();
          if (this.onClose) this.onClose();
          $(self.modalWindow).fadeOut(100);
          $(self.backgroundDiv).hide();

          setTimeout(function () {
              self.$el.remove();
              self.remove();
              $(self.modalWindow).remove();
              $(self.backgroundDiv).remove();
          }, 550);

          if (closeHandlerFn) {
              $(window).unbind('keydown', closeHandlerFn);
          }

          this.close();
      },

      handleKey: function (e) {
          if (e.keyCode == 27) { //escape
              this.closeModal();
              e.stopPropagation();
          }
      }

  });

});

require.define("/mixins/ErrorDialogueView.js",function(require,module,exports,__dirname,__filename,process,global){require('./BackboneModal');

var ErrorDialogueView = Backbone.ModalView.extend({
    tagName: 'div',
    className: 'error-dialogue',
    events: {
        'click .btn.done': 'closeModal'
    },

    doneButton: true,

    initialize: function (data, callback) {
        this.render(data.img, data.text);
        this.callback = callback;
    },

    _countdownToRefresh: function () {
        /* This only works for the DeployView, because there is a span w ID = countdown-ksikka. */
        var cntEl = document.getElementById("countdown-ksikka");

        function countdown() {
            var n = parseInt(cntEl.innerHTML);
            if (n == 0) {
                window.location.reload(true);
            } else {
                cntEl.innerHTML = n - 1;
                window.setTimeout(countdown, 1000);
            }
        }
        window.setTimeout(countdown, 1000);
    },

    render: function (img, text) {
        if (img) {
            this.el.innerHTML += '<img src="/static/img/' + img + '">';
        }
        if (text) {
            this.el.innerHTML += '<p>' + text + '</p>';
        }

        return this;
    }
});

exports.ErrorDialogueView = ErrorDialogueView;

});

require.define("/mixins/SimpleDialogueView.js",function(require,module,exports,__dirname,__filename,process,global){  require('./BackboneDialogue');

  var SimpleDialogueView = Backbone.DialogueView.extend({
      tagName: 'div',
      className: 'normal-dialogue',
      padding: 0,
      events: {
          'click .btn.done': 'closeModal'
      },

      initialize: function (data) {
          this.render(data.img, data.text);
      },

      render: function (img, text) {
          if (img) {
              this.el.innerHTML += '<img src="/static/img/' + img + '">';
          }

          if (text) {
              this.el.innerHTML += '<p>' + text + '</p>';
          }

          this.el.innerHTML += '<div class="bottom-sect"><div class="btn done">Done</div></div>';

          return this;
      }
  });

  exports.SimpleDialogueView = SimpleDialogueView;

});

require.define("/mixins/BackboneDialogue.js",function(require,module,exports,__dirname,__filename,process,global){  Backbone.DialogueView = Backbone.View.extend({
      width: 500,
      height: 160,
      padding: 0,
      css: 'dialogue',

      events: {
          'click .modal-bg': 'closeModal',
          'keydown': 'handleKey'
      },

      _configure: function (options) {
          Backbone.DialogueView.__super__._configure.call(this, options);
          this.backgroundDiv = this.setupModal();
          this.modalWindow = this.setupModalWindow();
          util.loadCSS(this.css);
          _.bindAll(this);
      },

      _ensureElement: function (options) {
          Backbone.DialogueView.__super__._ensureElement.call(this, options);
      },

      setupModal: function () {
          var self = this;
          var div = document.createElement('div');
          div.className = "modal-bg fadeIn";
          div.style.position = 'fixed';
          div.style.width = '100%';
          div.style.height = '100%';
          div.style.top = '0';
          div.style.left = '0';
          div.style.backgroundColor = '#222';
          div.style.opacity = '0.4';
          div.style.zIndex = 3000;
          document.body.appendChild(div);

          var closeHandler = function (e) {
              if (e.keyCode == 27) {
                  self.closeModal(closeHandler);
              }
          };

          $(div).on('click', function () {
              self.closeModal(closeHandler);
          });


          $(window).on('keydown', closeHandler);

          return div;
      },

      setupModalWindow: function () {
          var self = this;

          var div = document.createElement('div');
          div.style.position = 'fixed';
          div.className = 'modal ' + this.className;
          div.style.width = this.width + 'px';
          div.style.minHeight = '300px';
          div.style.padding = this.padding + 'px';

          if (this.height) div.style.height = this.height;

          div.style.top = '50%';
          div.style.left = '50%';
          div.style.marginLeft = '-' + (this.width / 2) + 'px';
          div.style.marginTop = '-240px';
          div.style.zIndex = 3001;

          var span = document.createElement('span');
          span.className = 'modal-cross';
          span.style.position = 'absolute';
          span.style.right = '15px';
          span.style.top = '15px';
          span.innerText = '×';
          div.appendChild(span);

          var content = document.createElement('div');
          content.style.width = '100%';
          div.appendChild(content);

          document.body.appendChild(div);

          $(span).on('click', function () {
              self.closeModal();
          });

          this.el = content;
          return div;
      },

      closeModal: function (closeHandlerFn) {
          var self = this;
          this.undelegateEvents();
          if (this.callback) this.callback();
          if (this.onClose) this.onClose();
          // fadeOut(function() { $(this).remove(); });
          $(self.modalWindow).fadeOut(100);
          $(self.backgroundDiv).hide();

          setTimeout(function () {
              self.$el.remove();
              self.remove();
              $(self.modalWindow).remove();
              $(self.backgroundDiv).remove();
          }, 550);

          if (closeHandlerFn) {
              $(window).unbind('keydown', closeHandlerFn);
          }

          this.stopListening();
      },

      handleKey: function (e) {
          if (e.keyCode == 27) { //escape
              this.closeModal();
              e.stopPropagation();
          }
      }

  });

});

require.define("/AppView.js",function(require,module,exports,__dirname,__filename,process,global){var ToolBarView = require('./template_editor/ToolBarView').ToolBarView;
var EditorView = require('./template_editor/EditorView').EditorView;
var PluginsView = require('./plugins_view/PluginsView').PluginsView;
var SettingsView = require('./SettingsView').SettingsView;
var RoutesView = require('./RoutesView').RoutesView;

var PluginsModel = require('./models/PluginsModel').PluginsModel;

var SoftErrorView = require("./SoftErrorView").SoftErrorView;
var ErrorDialogueView = require('./mixins/ErrorDialogueView').ErrorDialogueView;
var NodeModelsView = require('./models_view/NodeModelsView').NodeModelsView;


var AppView = Backbone.View.extend({

    events: {
        'click #save': 'save',
        'click #left-menu-toggle': 'toggleTopMenu',
        'click #deploy': 'deployApp',
        'click .undo': 'undo',
        'click .redo': 'redo'
    },

    el: document.getElementById('app-content'),

    initialize: function (options) {
        _.bindAll(this);

        this.model = options.model;
        this.appId = options.appId;
        this.pageId = options.pageId;

        this.toolBar = this.createSubview(ToolBarView, {
            pageId: -1
        });

        this.routesView = this.createSubview(RoutesView);
        this.routesView.setToggleEl($('.menu-app-routes'));
        this.routesView.setPointerPosition("130px");

        this.nodeModelsView = this.createSubview(NodeModelsView);
        this.nodeModelsView.setToggleEl($('.menu-app-entities'));
        this.nodeModelsView.setPointerPosition("180px");

        this.pluginsView = this.createSubview(PluginsView);
        this.pluginsView.setToggleEl($('.menu-app-plugins'));
        this.pluginsView.setPointerPosition("230px");

        this.settingsView = this.createSubview(SettingsView);
        this.settingsView.setToggleEl($('.menu-app-settings'));
        this.settingsView.setPointerPosition("30px");

        this.listenTo(v1State.get('plugins'), 'fork', this.save);
        //var autoSave = setInterval(this.save, 30000);
        this.render();

        util.askBeforeLeave();

    },

    render: function () {
        var pageId = 0;
        this.pageId = 0;

        this._cleanDiv = document.createElement('div');
        this._cleanDiv.className = "clean-div test1";
        var mainContainer = document.getElementById('main-container');
        mainContainer.appendChild(this._cleanDiv);

        this.toolBar.setPage(this.pageId);
        this.toolBar.setElement(document.getElementById('tool-bar')).render();

        this.el.appendChild(this.nodeModelsView.render().el);
        this.el.appendChild(this.pluginsView.render().el);
        this.el.appendChild(this.settingsView.render().el);
        this.el.appendChild(this.routesView.render().el);


        this.$leftMenu = this.$el.find('.left-menu-panel-l1 ');
        this.setupMenuHeight();

        $("html, body").animate({
            scrollTop: 0
        });

        this.doKeyBindings();
        Backbone.Regrettable.reset();

    },

    getCurrentPage: function () {
        return this.view.getCurrentTemplate();
    },

    showTemplateWithName: function (templateName) {

    },

    doKeyBindings: function () {
        keyDispatcher.bindComb('meta+s', this.save);
        keyDispatcher.bindComb('ctrl+s', this.save);
        // keyDispatcher.bindComb('meta+c', this.copy);
        // keyDispatcher.bindComb('ctrl+c', this.copy);
        // keyDispatcher.bindComb('meta+v', this.paste);
        // keyDispatcher.bindComb('ctrl+v', this.paste);
        keyDispatcher.bindComb('meta+z', this.undo);
        keyDispatcher.bindComb('ctrl+z', this.undo);
        keyDispatcher.bindComb('meta+y', this.redo);
        keyDispatcher.bindComb('ctrl+y', this.redo);

    },

    info: function (appId, tutorial) {
        var self = this;
        var AppInfoView = require('./AppInfoView');
        self.tutorialPage = "Application Settings";
        self.changePage(AppInfoView, {}, tutorial, function () {
            $('.menu-app-info').addClass('active');
        });
    },

    tables: function (tutorial) {
        var self = this;
        this.nodeModelsView.expand();
    },

    pages: function (appId, tutorial) {
        var self = this;
        self.tutorialPage = "Pages";
        var PagesView = require('./pages/PagesView').PagesView;

        $('#page').fadeIn();
        self.changePage(PagesView, {}, tutorial, function () {
            self.trigger('pages-loaded');
            $('.menu-app-pages').addClass('active');
        });
    },

    pageWithName: function (pageName) {
        var templateModel = this.model.get('templates').getTemplateWithName(pageName);
        this.page(templateModel);
    },

    pageWithIndex: function (pageId) {
        var templateModel = this.model.get('templates').models[pageId];
        this.page(templateModel);
    },

    page: function (templateModel) {

        if (this.view && templateModel == this.view.templateModel) return;
        if (!templateModel) templateModel = this.model.get('templates').models[0];
        this.tutorialPage = "Editor";
        this.tutorialPage = "Introduction";
        this.changePage(EditorView, {
            templateModel: templateModel,
            appModel: this.model
        }, "", function () {});

        this.toolBar.setTemplate(templateModel);

        this.$leftMenu = this.$el.find('.left-menu-panel-l1 ');
        this.setupMenuHeight();
        this.trigger('editor-loaded');
    },

    plugins: function (tutorial) {
        var self = this;
        this.pluginsView.expand();
    },

    renderIFrameContent: function (proxy) {
        this.view.renderIFrameContent(proxy);
    },

    changePage: function (NewView, options, tutorial, post_render) {

        if (this.view) this.view.close();

        var cleanDiv = this._cleanDiv;

        this.view = this.createSubview(NewView, options);
        this.view.setElement(cleanDiv).render();

        //v1.changeTitle(this.view.title);

        $("html, body").animate({
            scrollTop: 0
        });
        $('#page').fadeIn();
        post_render.call();

        if (tutorial && tutorial === 'tutorial/') {
            this.showTutorial();
        } else if (tutorial) {
            // remove random ending string from url path
            this.navigate(window.location.pathname.replace(tutorial, ''), {
                replace: true
            });
        } else {
            if (this.tutorialIsVisible) {
                this.tutorial.closeModal();
            }
        }
    },

    undo: function () {
        Backbone.Regrettable.undo();
    },

    redo: function () {
        Backbone.Regrettable.redo();
    },

    deployApp: function () {
        $('.deploy-text').html('Publishing');
        var threeDots = util.threeDots();
        $('.deploy-text').append(threeDots.el);

        var success_callback = function (data) {
            $('.deploy-text').html('Publish');
            clearInterval(threeDots.timer);
        };

        var hold_on_callback = function () {
            $('.deploy-text').html('Hold On, Still deploying.');
        };

        this.deployManager.deploy.call(this, success_callback, hold_on_callback);
    },

    save: function (e, callback) {
        if (v1.disableSave === true) return;
        if (appId === 0) return;

        $('#save-icon').attr('src', '/static/img/ajax-loader-white.gif');
        var $el = $('.menu-button.save');
        $el.fadeOut().html("<span class='icon'></span><span>Saving...</span>").fadeIn();

        var self = this;
        appState = v1State.serialize();
        if (DEBUG) console.log(appState);

        var successHandler = function (data) {
            util.dontAskBeforeLeave();
            v1.disableSave = false;

            v1State.set('version_id', data.version_id);

            $('#save-icon').attr('src', '/static/img/checkmark.png').hide().fadeIn();
            var timer = setTimeout(function () {
                $('#save-icon').attr('src', '/static/img/save.png').hide().fadeIn();
                clearTimeout(timer);
            }, 1000);
            $('.menu-button.save').html("<span class='icon'></span><span>Saved</span>").fadeIn();

            if ((typeof (callback) !== 'undefined') && (typeof (callback) == 'function')) {
                callback();
            }

            var timer2 = setTimeout(function () {
                $el.html("<span class='icon'></span><span>Save</span>").fadeIn();
                clearTimeout(timer2);
            }, 3000);
        };
        var softErrorHandler = function (jqxhr) {
            var data = JSON.parse(jqxhr.responseText);
            v1State.set('version_id', data.version_id);
            v1.disableSave = true;
            new SoftErrorView({
                text: data.message,
                path: data.path
            }, function () {
                v1.disableSave = false;
            });
        };
        var browserConflictHandler = function (jqxhr) {
            v1.disableSave = true;
            var content = {
                text: "Looks like you (or someone else) made a change to your app in another browser window. Please make sure you only use one window with Appcubator or you may end up overwriting your app with an older version. Please refresh the browser to get the updated version of your app."
            };
            if (BROWSER_VERSION_ERROR_HAPPENED_BEFORE) {
                content.text += '<br><br><br>Refreshing in <span id="countdown-ksikka">6</span> seconds...\n';
            }
            var errorModal = new ErrorDialogueView(content, function () {
                v1.disableSave = false;
            });
            if (BROWSER_VERSION_ERROR_HAPPENED_BEFORE) {
                errorModal._countdownToRefresh();
            }
            // global
            BROWSER_VERSION_ERROR_HAPPENED_BEFORE = true;
        };
        var hardErrorHandler = function (jqxhr) {
            v1.disableSave = true;
            var content = {};
            if (DEBUG)
                content = {
                    text: jqxhr.responseText
                };
            else
                content = {
                    text: "There has been a problem. Please refresh your page. We're really sorry for the inconvenience and will be fixing it very soon."
                };
            new ErrorDialogueView(content, function () {
                v1.disableSave = false;
            });
        };

        // for now, no difference
        var notFoundHandler = hardErrorHandler;
        v1.disableSave = true;

        $.ajax({
            type: "POST",
            url: '/app/' + this.appId + '/state/',
            data: JSON.stringify(appState),
            statusCode: {
                200: successHandler,
                400: softErrorHandler,
                409: browserConflictHandler,
                500: hardErrorHandler,
                404: notFoundHandler,
            },
            dataType: "JSON"
        });

        if (e) e.preventDefault();
        return false;
    },

    toggleTopMenu: function () {
        return (this.menuExpanded ? this.hideTopMenu : this.expandTopMenu)();
    },

    expandTopMenu: function () {
        $('#tool-bar').addClass('open');
        $('#main-container').addClass('open');
        this.menuExpanded = true;
        $('#main-container').on('click', this.hideTopMenu);
    },

    hideTopMenu: function () {
        $('#tool-bar').removeClass('open');
        $('#main-container').removeClass('open');
        this.menuExpanded = false;
        $('#main-container').off('click', this.hideTopMenu);
    },

    fetchPlugins: function (callback) {
        var self = this;
        $.ajax({
            type: "GET",
            url: '/app/' + appId + '/state/',
            statusCode: {
                200: function (data) {

                    self.refreshPlugins(data.plugins);
                    callback.call(this);
                }
            },
            dataType: "JSON"
        });

    },

    refreshPlugins: function (freshPlugins) {

        var plugins = v1State.get('plugins').toJSON();

        if (!_.isEqual(plugins, freshPlugins)) {
            console.log("REFRESHED PLUGINS");
            v1State.set('plugins', new PluginsModel(freshPlugins));
        }
    },

    download: function (callback) {
        var jqxhrToJson = function (jqxhr) {
            var data = {};
            try {
                data = JSON.parse(jqxhr.responseText);
            } catch (e) {
                data.errors = ["JSON response from server failed to parse", jqxhr.responseText];
            }
            return data;
        };

        // this is copy pasted from the save code. i dont know how to modularize these functions properly. ~ks
        var softErrorHandler = function (data) {
            v1State.set('version_id', data.version_id);
            v1.disableSave = true;
            new SoftErrorView({
                text: data.message,
                path: data.path
            }, function () {
                v1.disableSave = false;
            });
            return data;
        };

        var hardErrorHandler = function (data) {
            var content = {};
            if (DEBUG) content.text = data.responseText;
            else content.text = "There has been a problem. Please refresh your page. We're really sorry for the inconvenience and will be fixing it very soon.";
            new ErrorDialogueView(content);
            util.log_to_server('deployed app', {
                status: 'FAILURE',
                deploy_time: data.deploy_time + " seconds",
                message: data.errors
            }, this.appId);
            return data;
        };

        var downloadApp = function (callback) {
            var url = '/app/' + appId + '/zip/';
            var hiddenIFrameID = 'hiddenDownloader',
                iframe = document.getElementById(hiddenIFrameID);
            if (iframe === null) {
                iframe = document.createElement('iframe');
                iframe.id = hiddenIFrameID;
                iframe.style.display = 'none';
                document.body.appendChild(iframe);
            }
            iframe.src = url;
            callback();
        };

        $.ajax({
            type: "GET",
            url: '/app/' + appId + '/zip/',
            statusCode: {
                200: function (data) {
                    util.log_to_server('code downloaded', {}, appId);
                    downloadApp(callback);
                },
                400: function (jqxhr) {
                    var data = jqxhrToJson(jqxhr);
                    data = softErrorHandler(data);
                    data = callback(data);
                },
                500: function (jqxhr) {
                    var data = jqxhrToJson(jqxhr);
                    data = hardErrorHandler(data);
                    data = callback(data);
                },
            },
            dataType: "JSON"
        });
    },

    setupMenuHeight: function () {
        var height = $(document).height();

        this.$leftMenu.each(function () {
            $(this).height(height);
        });

        var self = this;
        $(window).resize(function () {
            var height = $(document).height();
            self.$leftMenu.height(height);
        });
    }

});

exports.AppView = AppView;

});

require.define("/template_editor/ToolBarView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var RouteModel = require('../models/RouteModel').RouteModel;
    var TemplateModel = require('../models/TemplateModel').TemplateModel;

    require('../mixins/BackboneNameBox');

    var tempTemplateItem = [
        '<li class="go-to-page" id="tb-template-<%= templateModel.cid %>">',
        '<span class="page icon"></span>',
        '<a><%= templateModel.get("name") %></a>',
        '</li>'
    ].join('\n');

    var ToolBarView = Backbone.View.extend({
        subviews: [],

        events: {
            'click .go-to-page': 'clickedGoToPage',
            'click a.back': 'navigateBack',
        },

        initialize: function (options) {
            _.bindAll(this);

            this.collection = v1State.get('templates');

            this.pageId = options.pageId;
            this.nmrFields = v1State.get('templates').length + 1;

            if (this.nmrFields > 6) this.nmrFields = 6;

            this.listenTo(v1State.get('templates'), 'add remove', function () {
                this.nmrFields = v1State.get('templates').length + 1;
                if (this.nmrFields > 6) this.nmrFields = 6;
            }, this);

            this.listenTo(v1State.get('templates'), 'add', this.newTemplateCreated);
        },

        setPage: function (pageId) {
            this.pageId = pageId;
            this.render();
        },

        setTemplate: function (templateModel) {
            this.templateModel = templateModel;
            this.render();
        },

        render: function () {
            if (this.templateModel) {
                util.get('current-page').innerHTML = this.templateModel.get('name');
            } else {
                util.get('current-page').innerHTML = "Pages";
            }

            this.pageList = util.get('page-list');
            this.pageList.innerHTML = '';

            this.collection.each(function (template, ind) {
                if (this.templateModel == template) return;
                this.renderPageItem(template);
            }, this);

            this.createBox = new Backbone.NameBox({
                txt: 'New Template'
            }).render();
            this.createBox.on('submit', this.createPage);

            util.get('create-page').appendChild(this.createBox.el);

            this.menuPages = document.getElementById('menu-pages');
            return this;
        },

        renderPageItem: function (templateModel) {
            this.pageList.innerHTML += _.template(tempTemplateItem, {
                templateModel: templateModel
            });
        },

        clickedGoToPage: function (e) {
            var templateCid = (e.currentTarget.id).replace('tb-template-', '');
            var goToPageId = 0;
            this.collection.each(function (templateM, ind) {
                if (templateM.cid == templateCid) {
                    goToPageId = ind;
                }
            });

            v1.navigate("app/" + appId + "/template/" + goToPageId + "/", {
                trigger: true
            });
        },

        createPage: function (name) {
            var routeModel = new RouteModel({
                name: name
            });
            routeModel.setupUrl(name);
            routeModel.setGenerator("routes.staticpage");
            v1State.get('routes').push(routeModel);

            var templateModel = new TemplateModel({
                name: name
            });
            templateModel.setGenerator("templates.page");
            this.collection.add(templateModel);

            v1.currentApp.save();
        },

        newTemplateCreated: function (templateM) {
            var str = _.template(tempTemplateItem, {
                templateModel: templateM
            });
            this.$el.find('#page-list').append(str);
            util.scrollToBottom(this.$el.find('#page-list'));
        },

        navigateBack: function () {
            window.history.back();
        },

        save: function () {
            v1.save();
            return false;
        }

    });

    exports.ToolBarView = ToolBarView;

});

require.define("/mixins/BackboneNameBox.js",function(require,module,exports,__dirname,__filename,process,global){  Backbone.NameBox = Backbone.View.extend({
      el: null,
      tagName: 'div',
      txt: "",
      events: {
          'click': 'showForm',
          'submit form': 'createFormSubmitted',
          'keydown input[type="text"]': 'keyDown'
      },

      initialize: function (inp) {
          _.bindAll(this, 'render', 'showForm', 'createFormSubmitted');
          if (inp.txt) {
              this.txt = inp.txt;
          }
          return this;
      },

      render: function () {
          if (this.txt) {
              this.el.innerHTML += '<div class="box-button text">' + this.txt + '</div>';
          }
          if (!this.$el.find('form').length) {
              this.el.innerHTML += "<form style='display:none;'><input type='text' placeholder='Name...'></form>";
          }
          return this;
      },

      showForm: function (e) {
          this.$el.find('.box-button').hide();
          this.$el.find('form').fadeIn();
          this.$el.find('input[type="text"]').focus();
      },

      createFormSubmitted: function (e) {
          e.preventDefault();
          var nameInput = this.$el.find('input[type=text]');
          var name = nameInput.val();
          if (name.length > 0) {
              nameInput.val('');
              this.$el.find('form').hide();
              this.$el.find('.box-button').fadeIn();
              this.trigger('submit', name);
          } else {
              this.reset();
          }
      },

      keyDown: function (e) {
          if (e.keyCode === 27) this.reset();
      },

      reset: function () {
          var nameInput = this.$el.find('input[type=text]');
          nameInput.val('');
          this.$el.find('form').hide();
          this.$el.find('.box-button').fadeIn();
      }

  });

  return Backbone;

});

require.define("/template_editor/EditorView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var UrlView = require('../pages/UrlView').UrlViews;
    var SimpleModalView = require('../mixins/SimpleModalView').SimpleModalView;
    var ErrorModalView = require('../mixins/ErrorModalView').ErrorModalView;
    var DebugOverlay = require('../mixins/DebugOverlay').DebugOverlay;
    var WidgetEditorView = require('./WidgetEditorView').WidgetEditorView;
    var EditorGalleryView = require('./EditorGalleryView').EditorGalleryView;
    var PageView = require('../pages/PageView').PageView;

    var PageTemplatePicker = require('./PageTemplatePicker').PageTemplatePicker;
    var GuideView = require('./GuideView').GuideView;
    var RedoController = require('../RedoController').RedoController;
    var CSSEditorView = require('../css-editor/CSSEditorView').CSSEditorView;
    var SectionShadowView = require('./SectionShadowView').SectionShadowView;
    var SectionEditorsView = require('./SectionEditorsView').SectionEditorsView;

    var EditorTemplate = require('./editor-templates').EditorTemplate;

    /* An EditorView belongs to a TemplateModel */
    var EditorView = Backbone.View.extend({
        className: 'editor-page',
        css: "bootstrap-editor",

        events: {
            'click .menu-button.help': 'help',
            'click .menu-button.question': 'question',
            'click .url-field': 'clickedUrl',
            'click .refresh-page': 'refreshPage',
            'click #page-info': 'pageInfo',
            'click #close-page-info': 'closePageInfo',
            'click #design-mode-button': 'switchToDesignMode',
            'click #close-css-editor': 'switchOffDesignMode',
            'click .mobile-preview': 'switchToMobileMode'
        },

        initialize: function (options) {
            _.bindAll(this);

            this.appModel = options.appModel;

            if (options && (options.pageId == "0" || options.pageId >= 0)) {
                this.pageId = options.pageId;
                pageId = options.pageId;
                this.model = this.appModel.get('templates').models[pageId];
            } else if (options.templateModel) {
                this.model = options.templateModel;
            } else {
                throw "No Template Model Provided.";
            }

            this.routeModel = v1State.get('routes').getRouteWithTemplate(this.model);
            // note that if the template does not have a route, routeModel will be null.
            this.pageName = this.model.get('name');

            v1State.currentPage = this.model;
            this.appModel.currentPage = this.model;
            v1State.isMobile = false;
            this.appModel.isMobile = false;


            this.sectionsCollection = this.model.getSections();

            this.galleryEditor = new EditorGalleryView(this.sectionsCollection);
            this.sectionsManager = {};
            //this.guides = new GuideView(this.sectionsCollection);
            this.cssEditorView = new CSSEditorView();
            // PageView currently knows how to handle null routeModel
            this.pageView = new PageView(this.routeModel, this.model, pageId);

            // TODO: setup redo controller again
            // this.redoController = new RedoController();
            this.widgetEditorView = new WidgetEditorView();
            v1.widgetEditorView = this.WidgetEditorView;

            keyDispatcher.bindComb('meta+e', this.refreshPage);
            keyDispatcher.bindComb('ctrl+e', this.refreshPage);

            // keyDispatcher.bindComb('ctrl+z', this.redoController.undo);
            // keyDispatcher.bindComb('meta+shift+z', this.redoController.redo);
            // keyDispatcher.bindComb('ctrl+shift+z', this.redoController.redo);

            //g_guides = this.guides;

            this.title = "Editor";

            if (this.routeModel) {
                this.urlModel = this.routeModel.get('url');
                this.listenTo(this.routeModel.get('url').get('urlparts'), 'add remove', this.renderUrlBar);
            }

            this.listenTo(this.model, 'scroll', this.scrollTo);

        },

        render: function () {

            this.start = new Date().getTime();

            var self = this;
            if (!this.el.innerHTML) {
                this.el.innerHTML = _.template(util.getHTML('editor-page'), {
                    pageId: this.pageId
                });
            }

            document.body.style.overflow = "hidden";

            this.renderUrlBar();
            this.galleryEditor.render();

            this.el.appendChild(this.widgetEditorView.render().el);
            this.cssEditorView.setElement($('#css-editor-panel')).render();
            this.pageView.setElement($('#page-view-panel')).render();

            /* Access to elements inside iframe */
            var iframe = document.getElementById('page');
            this.iframe = iframe;

            this.setupPageWrapper();

            window.addEventListener('resize', this.setupPageWrapper);

            $('#loading-gif').fadeOut().remove();

            $('.left-buttons').tooltip({
                position: {
                    my: "left+10 center",
                    at: "right center",
                    using: function (position, feedback) {
                        $(this).css(position);
                        $("<div>")
                            .addClass("arrow")
                            .addClass(feedback.vertical)
                            .addClass(feedback.horizontal)
                            .appendTo(this);
                    }
                }
            });

            this.$pageContainer = this.$el.find('.page-container');
            return this;
        },

        renderIFrameContent: function (proxy) {
            var self = this;
            var iframe = document.getElementById('page');
            innerDoc = iframe.contentDocument || iframe.contentWindow.document;

            this.widgetEditorView.setupScrollEvents();

            keyDispatcher.addEnvironment(innerDoc);

            this.iframeProxy = proxy;
            //this.marqueeView = proxy.setupMarqueeView(this.sectionsCollection.getAllWidgets());

            this.iframeProxy.injectHeader(this.model.get('head'));

            this.sectionsManager = proxy.setupSectionsManager(this.sectionsCollection);
            this.sectionShadowView = new SectionShadowView(this.sectionsCollection);
            this.sectionEditorsView = new SectionEditorsView(this.sectionsCollection);

            self.iframedoc = innerDoc;
            //self.marqueeView.render();
            self.sectionsManager.render();
            self.sectionShadowView.render();
            self.sectionEditorsView.render();

            //self.guides.setElement(innerDoc.getElementById('elements-container')).render();
            //$(innerDoc.getElementById('elements-container')).append(self.marqueeView.el);

            self.startUIStateUpdater(proxy);

            /* TODO re-implement page templates
            if (!this.model.get('uielements').length) {
                var templatePicker = new PageTemplatePicker({ model: this.model, callback: function() {
                    $('.options-area').hide();
                    $('.page-wrapper').addClass('show');
                }});

                this.$el.find('.options-area').append(templatePicker.render().el);
            }
            else { */

            this.$el.find('.page-wrapper').addClass('show');
            this.iframeProxy.updateScrollbar();
            this.$el.find('.loader').remove();
            var end = new Date().getTime();
            var time = end - this.start;
            console.log('Load time: ' + time);

            /* } */
        },

        getCurrentTemplate: function () {
            return this.templateModel;
        },

        renderUrlBar: function () {
            if (this.routeModel) {
                this.$el.find('.url-field').html(this.urlModel.getUrlString());
            }
        },

        help: function (e) {
            new TutorialView([6]);
        },

        startUIStateUpdater: function (proxy) {
            // XXX XXX XXX
            // temp disable this.
            return;
            var self = this;
            this.listenTo(v1UIEState, 'synced', proxy.reArrangeCSSTag);

            this.UIStateTimer = setInterval(function () {
                self.fetchUIState(function (state) {
                    /* crappy fix */
                    _.each(state.texts, function (text) {
                        text.tagName = "div";
                    });

                    if (!_.isEqual(state, uieState)) {
                        self.renewUIEState(state, proxy);
                    }
                });

            }, 10000);
        },

        fetchUIState: function (callback) {
            // XXX XXX XXX
            // temp disable this.
            return;
            $.ajax({
                type: "GET",
                url: '/temp.css',
                statusCode: {
                    200: callback,
                    400: callback,
                },
                dataType: "JSON"
            });
        },

        renewUIEState: function (newState, proxy) {
            uieState = newState;
            proxy.reArrangeCSSTag();
        },

        question: function (e) {
            olark('api.box.show');
            olark('api.box.expand');
        },

        clickedUrl: function () {
            var newView = new UrlView(this.urlModel, this.model);
            newView.onClose = this.renderUrlBar;
        },

        refreshPage: function () {
            this.widgetEditorView.clear();
            this.sectionsManager.close();
            this.sectionsManager = null;
            var self = this;
            v1.currentApp.fetchPlugins(function () {
                self.iframeProxy.reloadPage();
            });
        },

        setupPageWrapper: function () {
            var height = window.innerHeight - 90;
            util.get('page-wrapper').style.height = height + 'px';
            this.$el.find('.page.full').css('height', height - 46);
        },

        scrollTo: function (widget) {

            var pageHeight = window.innerHeight - 90 - 46;
            var pageTop = $('#page').scrollTop();

            var pageHeightUnit = Math.floor(pageHeight / 15);
            var topUnit = Math.floor(pageTop / 15);

            if ((widget.getBottom() + 6) > (pageHeightUnit + topUnit)) {
                $('#page').scrollTop((widget.getBottom() - pageHeightUnit + widget.get('layout').get('height') + 1) * 15);
            }

        },

        pageInfo: function () {
            this.pageView.expand();
        },

        closePageInfo: function () {
            this.pageView.hide();
            $('.left-buttons').removeClass('invisible');
            this.$pageContainer.removeClass('packed');
            this.galleryEditor.show();
        },

        switchToDesignMode: function () {
            this.cssEditorView.expand();
            $('.left-buttons').addClass('invisible');
            this.$pageContainer.addClass('packed');
            this.galleryEditor.hide();
        },

        switchOffDesignMode: function () {
            this.cssEditorView.hide();
            $('.left-buttons').removeClass('invisible');
            this.$pageContainer.removeClass('packed');
            this.galleryEditor.show();
        },

        switchToMobileMode: function () {

            if (!this.mobilePreview) {
                util.get('page-wrapper').style.width = 270 + 'px';
                this.mobilePreview = true;
                $('.mobile-preview').addClass('active');
            } else {
                util.get('page-wrapper').style.width = "";
                this.mobilePreview = false;
                $('.mobile-preview').removeClass('active');
            }

        },

        close: function () {

            g_guides = null;
            window.removeEventListener('resize', this.setupPageWrapper);
            document.body.style.overflow = "";

            clearInterval(this.UIStateTimer);

            // keyDispatcher.unbind('meta+z', this.redoController.redo);
            // keyDispatcher.unbind('ctrl+z', this.redoController.redo);

            // TODO: fix this
            //EditorView.__super__.close.call(this);
            this.undelegateEvents();
            this.$el.removeData().unbind();
            this.remove();
            this.unbind();
        }

    });

    exports.EditorView = EditorView;

});

require.define("/pages/UrlView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var DialogueView = require('../mixins/DialogueView');
    require('../mixins/BackboneModal');

    var UrlTemplate = {};

    UrlTemplate.mainTemplate = [
        '<h3 class="hi3 hoff1 edit-url">Edit URL</h3>',
        '<div class="row well well-small">',
        '<p class="span24 offset2 hoff1"><strong>Full URL: </strong><span class="full-url"></span></p>',
        '</div>',
        '<form class="form-horizontal">',
        '<ul class="row hoff1 url-parts"></ul>',
        '<div class="row hoff2 hi3 offset2">',
        '<div class="btn btn-info btn-small offset1 new-suffix">+ Add Custom Text</div>',
        '</div>',
        '</form>'
    ].join('\n');

    UrlTemplate.contextTemp = [
        '<label class="control-label">Context Data:</label>',
        '<select class="context-part span16 offset1" id="form-<%= cid %>">',
        '<% _.each(entities, function(name, i) { %>',
        '<option value="<%= name %>" <% if(name == value) { %> selected <% } %> > <%= name %> ID</option>',
        '<% }); %>',
        '</select>',
        '<span id="remove-<%= cid %>" class="remove offset1">×</span>',
    ].join('\n');

    UrlTemplate.suffixTemp = [
        '<label class="control-label">Custom Text:</label>',
        '<input type="text" id="form-<%= cid %>" class="span16 offset1 suffix-part" placeholder="customtext" value="<%= value %>">',
        '<span id="remove-<%= cid %>" class="remove offset1">×</span>',
    ].join('\n');


    var UrlView = Backbone.ModalView.extend({
        padding: 0,
        width: 600,
        id: 'url-editor',
        //height: 150,
        events: {
            'change .context-part': 'contextPartChanged',
            'keyup .suffix-part': 'suffixPartChanged',
            'keyup .page-name': 'pageNameChanged',
            'click .remove': 'clickedRemove',
            'click .new-suffix': 'addNewSuffixPart',
            'submit form': 'cancelFormSubmit'
        },

        initialize: function (urlModel, pageModel) {
            _.bindAll(this);

            this.model = urlModel;
            this.pageModel = pageModel;
            this.listenTo(this.model.get('urlparts'), 'add remove', this.renderFullUrl);
            this.listenTo(this.model.get('urlparts'), 'change:value', this.renderFullUrl);
            this.listenTo(this.model.get('urlparts'), 'add', this.appendUrlPartForm);
            this.listenTo(this.model.get('urlparts'), 'remove', this.removeUrlPart);
            this.listenTo(this.model.get('urlparts'), 'reset', this.renderUrlParts);
            this.render();
        },

        render: function () {
            var temp = UrlTemplate.mainTemplate;
            this.el.innerHTML = _.template(temp, this.model.serialize());
            this.renderUrlParts();
            this.renderFullUrl();

            this.$('.url-parts').sortable({
                stop: this.changedOrder,
                axis: 'y'
            });

            return this;
        },

        renderFullUrl: function () {
            this.$('.full-url').text(this.model.getUrlString());
        },

        renderUrlParts: function () {
            this.$('.url-parts').empty();
            this.model.get('urlparts').each(this.appendUrlPartForm);
        },

        appendUrlPartForm: function (urlpart, index) {
            var value = urlpart.get('value');

            // render table urlpart
            if (value.indexOf('{{') === 0) {
                var variable = value.replace('{{', '').replace('}}', '');
                var newContext = document.createElement('li');
                newContext.className = 'row hoff1';
                newContext.id = "urlpart-" + urlpart.cid;
                newContext.innerHTML = _.template(UrlTemplate.contextTemp, {
                    cid: urlpart.cid,
                    value: variable,
                    entities: _.union(v1State.get('tables').pluck('name'), v1State.get('users').pluck('name'))
                });
                this.$('.url-parts').append(newContext);
            }

            // render suffix urlpart
            else {
                var newSuffix = document.createElement('li');
                newSuffix.className = 'row hoff1';
                newSuffix.id = "urlpart-" + urlpart.cid;
                newSuffix.innerHTML = _.template(UrlTemplate.suffixTemp, {
                    cid: urlpart.cid,
                    value: value
                });
                this.$('.url-parts').append(newSuffix);
            }
        },

        clickedRemove: function (e) {
            var cid = e.currentTarget.id.replace('remove-', '');
            this.model.get('urlparts').remove(cid);
        },

        removeUrlPart: function (urlpart, index) {
            this.$('#urlpart-' + urlpart.cid).remove();
        },

        contextPartChanged: function (e) {
            var cid = e.target.id.replace('form-', '');
            this.model.get('urlparts').get(cid).set('value', "{{" + e.target.value + "}}");
            return false;
        },

        suffixPartChanged: function (e) {
            var cid = e.target.id.replace('form-', '');
            this.model.get('urlparts').get(cid).set('value', e.target.value);
            return false;
        },

        pageNameChanged: function (e) {
            this.model.set('name', e.currentTarget.value);
            this.renderFullUrl();
        },

        askToAddContext: function () {
            var self = this;
            var translateTypetoNL = function (str) {
                if (str == "node") {
                    str = "Widget";
                }
                return str;
            };

            var model = this.model;

            var widgets = v1State.getWidgetsRelatedToPage(this.pageModel);
            var links = v1State.getNavLinkRelatedToPage(this.pageModel);

            var widgetsNLString = "";
            if (widgets.length) {
                var widgetsNL = _.map(widgets, function (widget) {
                    return translateTypetoNL(widget.widget.get('type')) + ' on ' + widget.pageName;
                });
                widgetsNLString = widgetsNL.join('<br>');

            }

            var linksNLString = "";
            if (links.length) {
                var linksNL = _.map(links, function (link) {
                    return 'Link on ' + link.section + ' of ' + link.pageName;
                });
                linksNLString = linksNL.join('<br>');
            }

            if (!links.length && !widgets.length) {
                self.addNewContextPart();
            } else {

                new DialogueView({
                    text: "The elements listed below will be deleted if you add a context to this URL because they will no longer be valid. Do you want to proceed? <br><br> " + widgetsNLString + linksNLString
                }, function () {

                    _.each(widgets, function (widget) {
                        widget.widget.collection.remove(widget.widget);
                    });

                    _.each(links, function (link) {
                        link.link.collection.remove(link.link);
                    });

                    self.addNewContextPart();
                });
            }
        },

        addNewSuffixPart: function (e) {
            this.model.get('urlparts').push({
                value: 'customtext'
            });
            this.$('.suffix-part').last().focus();
        },

        changedOrder: function (e, ui) {
            var self = this;
            var sortedIDs = $('.url-parts').sortable("toArray");
            console.log(this.model.get('urlparts').serialize());

            var newUrlParts = _(sortedIDs).map(function (id) {
                return self.model.get('urlparts').get(id.replace('urlpart-', ''));
            });

            this.model.get('urlparts').reset(newUrlParts);
            console.log(this.model.get('urlparts').serialize());
        },
        cancelFormSubmit: function () {
            return false;
        }
    });

    exports.UrlView = UrlView;

});

require.define("/mixins/DialogueView.js",function(require,module,exports,__dirname,__filename,process,global){require('./BackboneDialogue');

var SimpleDialogueView = Backbone.DialogueView.extend({
    tagName: 'div',
    className: 'normal-dialogue',
    padding: 0,

    events: {
        'click .btn.ok': 'okCase',
        'click .btn.cancel': 'cancelCase'
    },

    initialize: function (data, successCallback) {
        _.bindAll(this);
        this.successCallback = successCallback;
        this.render(data.text);
    },

    render: function (text) {
        if (text) {
            this.el.innerHTML += '<p style="padding:30px;">' + text + '</p>';
        }

        this.el.innerHTML += '<div class="bottom-sect"><div class="btn cancel">Cancel</div><div class="btn ok offset1">Ok</div></div>';

        return this;
    },

    okCase: function () {
        this.successCallback.call(this);
        this.closeModal();
    },

    cancelCase: function () {
        this.closeModal();
    }

});

exports.SimpleDialogueView = SimpleDialogueView;

});

require.define("/mixins/ErrorModalView.js",function(require,module,exports,__dirname,__filename,process,global){  require('./BackboneModal');
  var ErrorModalView = Backbone.ModalView.extend({
      tagName: 'div',
      className: 'deployed',

      initialize: function (data, callback) {
          this.render(data.img, data.text);
          this.callback = callback;
      },

      render: function (img, text) {
          if (img) {
              this.el.innerHTML += '<img src="/static/img/' + img + '">';
          }

          if (text) {
              text = text.replace('\n', '<br />');
              text = text.replace(' ', '&nbsp;');
              this.el.innerHTML += '<h3>' + text + '</h3>';
          }
          return this;
      }
  });

  exports.ErrorModalView = ErrorModalView;

});

require.define("/mixins/DebugOverlay.js",function(require,module,exports,__dirname,__filename,process,global){  require('./BackboneModal');

  var ErrorModalView = Backbone.ModalView.extend({
      tagName: 'div',
      className: 'deployed',

      setupModal: function () {
          var self = this;
          var div = document.createElement('div');
          div.className = "modal-bg fadeIn";
          div.style.position = 'fixed';
          div.style.width = '100%';
          div.style.height = '100%';
          div.style.top = '0';
          div.style.left = '0';
          div.style.backgroundColor = '#222';
          div.style.opacity = '0.6';
          div.style.zIndex = 3000;
          document.body.appendChild(div);

          var closeHandler = function (e) {
              if (e.keyCode == 27) {
                  self.closeModal(closeHandler);
              }
          };

          $(div).on('click', function () {
              self.closeModal(closeHandler);
          });


          $(window).on('keydown', closeHandler);

          return div;
      },

      setupModalWindow: function () {
          var self = this;

          var div = document.createElement('div');
          div.style.position = 'fixed';
          div.className = this.className;
          div.style.width = "85%";
          div.style.color = "white";
          div.style.lineHeight = "2em";
          div.style.fontSize = "16px";
          if (this.height) div.style.height = this.height;
          div.style.top = '0';
          /*
      div.style.left = '50%';
      div.style.marginLeft= '-'+ (this.width/2) +'px';
      div.style.marginTop = '-300px';
      */
          div.style.padding = this.padding + 'px';
          div.style.zIndex = 3001;

          var span = document.createElement('span');
          span.className = 'modal-cross';
          span.style.position = 'absolute';
          span.style.right = '15px';
          span.style.top = '15px';
          span.innerText = '×';
          div.appendChild(span);

          var content = document.createElement('div');
          content.style.width = '100%';
          div.appendChild(content);

          document.body.appendChild(div);

          $(span).on('click', function () {
              self.closeModal();
          });

          this.el = content;
          return div;
      },

      closeModal: function (closeHandlerFn) {
          var self = this;
          this.undelegateEvents();
          if (this.callback) this.callback();
          if (this.onClose) this.onClose();
          // fadeOut(function() { $(this).remove(); });
          $(self.modalWindow).fadeOut(100);
          $(self.backgroundDiv).hide();

          setTimeout(function () {
              self.$el.remove();
              self.remove();
              $(self.modalWindow).remove();
              $(self.backgroundDiv).remove();
          }, 550);

          if (closeHandlerFn) {
              $(window).unbind('keydown', closeHandlerFn);
          }

          this.stopListening();
      },
      initialize: function (data) {
          this.render(data.img, data.text);
      },

      render: function (img, text) {
          if (img) {
              this.el.innerHTML += '<img src="/static/img/' + img + '">';
          }

          if (text) {
              text = text.replace(/\n/g, '</p><p>');
              text = text.replace(/ /g, '&nbsp;');
              this.el.innerHTML += '<p>' + text + '</p>';
          }
          return this;
      }
  });

  exports.ErrorModalView = ErrorModalView;

});

require.define("/template_editor/WidgetEditorView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var WidgetSettingsView = require('./WidgetSettingsView').WidgetSettingsView;
    var WidgetContentEditorView = require('./WidgetContentEditorView').WidgetContentEditorView;
    var WidgetLayoutEditorView = require('./WidgetLayoutEditorView').WidgetLayoutEditorView;
    var WidgetClassPickerView = require('./WidgetClassPickerView').WidgetClassPickerView;
    var CustomWidgetEditorModal = require('./CustomWidgetEditorModal').CustomWidgetEditorModal;

    var WidgetEditorView = Backbone.UIView.extend({

        className: 'widget-editor animated',
        id: 'widget-editor',
        tagName: 'div',
        css: 'widget-editor',
        type: 'widget',
        subviews: [],

        events: {
            'click .settings': 'openSettingsView',
            'click .pick-style': 'openStylePicker',
            'click .done-editing': 'closeEditingMode',
            'click .delete-button': 'clickedDelete',
            'click .done-text-editing': 'clickedDoneTextEditing',
            'click .edit-custom-widget-btn': 'openCustomWidgetEditor',
            'click': 'clicked',
            'change select': 'mouseup'
        },

        initialize: function () {
            _.bindAll(this);
            this.subviews = [];
            util.loadCSS(this.css);
            this.model = null;
        },

        setModel: function (widgetModel) {
            if (this.model) {
                this.unbindModel(widgetModel);
            }

            this.model = widgetModel;

            this.listenTo(this.model, 'startEditing', this.startedEditing);
            this.listenTo(this.model, 'stopEditing cancelEditing', this.stoppedEditing);
            this.listenTo(this.model, 'reselected', this.show);
            this.listenTo(this.model, 'deselected', this.clear);

            return this;
        },

        unbindModel: function (model) {
            this.stopListening(model, 'startEditing', this.startedEditing);
            this.stopListening(model, 'stopEditing cancelEditing', this.stoppedEditing);
            this.stopListening(model, 'reselected', this.show);
            this.stopListening(model, 'deselected', this.clear);
        },

        render: function () {
            this.hide();
            return this;
        },

        setupScrollEvents: function () {
            var self = this;
            var timer;
            $(innerDoc).bind('scroll', function () {
                clearTimeout(timer);
                timer = setTimeout(refresh, 150);
                self.hide();
            });

            var refresh = function () {
                if (!self.model) return;
                self.show();
            };

        },

        display: function () {
            if (!this.model) return;

            this.clearContent();
            this.fillContent();
            this.show();
        },

        show: function () {
            if (!this.model) return;
            this.stopListening(this.model, 'rendered', this.show);

            var location = this.getLocation();
            this.location = location;
            this.el.className += ' ' + location;

            var iframe = document.getElementById('page');
            var innerDoc = iframe.contentDocument || iframe.contentWindow.document;
            var element = $(innerDoc).find("[data-cid='" + this.model.cid + "']")[0];

            if (!element) {
                this.listenTo(this.model, 'rendered', this.show);
                return;
            }

            var offsetFrame = util.getWindowRelativeOffset(window.document, iframe);
            var offset = util.getWindowRelativeOffset(window.document, element);

            var leftDist = offset.left + offsetFrame.left;
            var topDist = offset.top + offsetFrame.top;

            this.$el.find('.arw').remove();

            switch (this.location) {
            case "right":
                this.$el.append('<div class="left-arrow arw"></div>');
                leftDist += element.getBoundingClientRect().width;
                this.$el.addClass('fadeInRight');

                break;
            case "bottom":
                this.$el.append('<div class="top-arrow arw"></div>');
                topDist += element.getBoundingClientRect().height;
                this.$el.addClass('fadeInUp');

                break;
            case "left":
                this.$el.append('<div class="right-arrow arw"></div>');
                this.$el.addClass('fadeInLeft');
                break;
            case "top":
                // not supposed to happen
                break;
            }
            this.$el.show();


            this.el.style.left = leftDist + 'px';
            this.el.style.top = topDist + 'px';

            this.model.trigger('display-widget-editor');

            return this;
        },

        fillContent: function () {
            var action = "";
            var type = this.model.get('type');

            this.layoutEditor = new WidgetLayoutEditorView(this.model);
            this.el.appendChild(this.layoutEditor.el);

            if (this.model.has('className')) {
                this.widgetClassPickerView = new WidgetClassPickerView(this.model);
                this.listenTo(this.widgetClassPickerView, 'change', this.classChanged);
                this.el.appendChild(this.widgetClassPickerView.el);
                this.el.appendChild(this.renderButtonWithText('pick-style', 'Pick Style'));
            }

            if (this.model.has('href') || this.model.has('src')) {
                this.contentEditor = new WidgetContentEditorView(this.model, this);
                this.el.appendChild(this.contentEditor.el);
            }

            if (type == "custom-widget") {
                this.el.appendChild(this.renderButtonWithText('edit-custom-widget-btn', 'Edit Custom Widget'));
            }

            this.el.appendChild(this.renderSettingsAndDelete('edit-custom-widget-btn', 'Edit Custom Widget'));
        },

        clearContent: function () {
            this.$el.find('.btn-toolbar').remove();

            if (this.contentEditor) {
                this.contentEditor.clear();
            }
            if (this.layoutEditor) {
                this.layoutEditor.clear();
            }
            if (this.infoEditor) {
                this.infoEditor.clear();
            }

            $('.btn-toolbar').remove();

            _(this.subviews).each(function (subview) {
                subview.close();
            });
            this.el.innerHTML = '';
            this.el.style.width = '';
        },

        renderButtonWithText: function (className, buttonText) {
            return this.renderButtonWithWidthCustomWidth(className, buttonText, 230);
        },

        renderButtonWithWidthCustomWidth: function (className, buttonText, width) {
            var li = document.createElement('ul');
            li.className = 'pad w-section section-' + className;
            li.innerHTML += '<span class="option-button tt ' + className + '" style="width:' + width + 'px; display: inline-block;">' + buttonText + '</span>';
            return li;
        },

        renderButtonWithDeleteButtonandText: function (className, buttonText) {
            var li = document.createElement('ul');
            li.className = 'w-section section-' + className;
            li.innerHTML += '<span class="' + className + '  option-button tt" style="width:190px; display: inline-block;">' + buttonText + '</span><span id="delete-widget" class="option-button delete-button tt" style="width:34px;"></span>';
            return li;
        },

        renderSettingsAndDelete: function () {
            var li = document.createElement('ul');
            li.className = 'w-section';
            li.innerHTML += '<span id="delete-widget" class="option-button delete-button tt"></span><span class="option-button tt settings"></span>';
            return li;
        },

        openStylePicker: function (e) {
            this.hideSubviews();
            this.widgetClassPickerView.show();
            this.widgetClassPickerView.expand();
        },

        openCustomWidgetEditor: function () {
            new CustomWidgetEditorModal(this.model);
        },

        openSettingsView: function () {
            new WidgetSettingsView(this.model).render();
        },

        closeEditingMode: function () {
            this.$el.find('.section-done-editing').remove();
            this.el.style.width = '';
            $(this.listGalleryView).remove();
            this.showSubviews();
            this.model.trigger('editModeOff');
            this.model.trigger('stopEditingRow');
            this.model.trigger('unhighlight');
        },

        clickedDoneTextEditing: function () {
            this.model.trigger('stopEditing');
        },

        classChanged: function () {
            this.showSubviews();
            this.widgetClassPickerView.$el.hide();
        },

        startedEditing: function () {
            if (this.editingMode) return;
            this.hideSubviews();
            this.el.appendChild(this.renderButtonWithText('done-text-editing', 'Done Editing'));
            this.editingMode = true;
        },

        stoppedEditing: function () {
            $('.btn-toolbar').remove();
            $('.section-done-text-editing').remove();
            this.showSubviews();
            this.editingMode = false;
        },

        clear: function () {
            this.clearContent();
            this.unbindModel(this.model);

            this.model = null;

            this.hide();
        },

        hide: function () {
            this.$el.removeClass('left');
            this.$el.removeClass('right');
            this.$el.removeClass('bottom');

            this.$el.removeClass('fadeInBottom');
            this.$el.removeClass('fadeInUp');
            this.$el.removeClass('fadeInLeft');
            this.$el.removeClass('fadeInRight');
            this.$el.hide();
        },

        setTempContent: function (domNode) {
            this.tempContent = domNode;
            this.hideSubviews();
            this.el.appendChild(domNode);
        },

        removeTempContent: function () {
            if (this.tempContent) this.el.removeChild(this.tempContent);
            this.showSubviews();
        },

        showSubviews: function () {
            //if(this.widgetClassPickerView) this.widgetClassPickerView.$el.fadeIn();
            if (this.contentEditor) this.contentEditor.$el.fadeIn();
            if (this.layoutEditor) this.layoutEditor.$el.fadeIn();
            if (this.infoEditor) this.infoEditor.$el.fadeIn();
            this.$el.find('.section-style-editor').fadeIn();
            this.$el.find('.section-form-editor-btn').fadeIn();
            this.$el.find('.section-query-editor-btn').fadeIn();
            this.$el.find('.section-edit-query-btn').fadeIn();
            this.$el.find('.section-edit-row-btn').fadeIn();
            this.$el.find('.section-delete-button').fadeIn();
            this.$el.find('.section-pick-style').fadeIn();
            this.$el.find('.section-edit-login-form-btn').fadeIn();
        },

        hideSubviews: function () {
            if (this.widgetClassPickerView) this.widgetClassPickerView.$el.hide();
            if (this.contentEditor) this.contentEditor.$el.hide();
            if (this.layoutEditor) this.layoutEditor.$el.hide();
            if (this.infoEditor) this.infoEditor.$el.hide();
            this.$el.find('.section-edit-login-form-btn').hide();
            this.$el.find('.section-style-editor').hide();
            this.$el.find('.section-form-editor-btn').hide();
            this.$el.find('.section-query-editor-btn').hide();
            this.$el.find('.section-edit-query-btn').hide();
            this.$el.find('.section-edit-row-btn').hide();
            this.$el.find('.section-delete-button').hide();
            this.$el.find('.section-pick-style').hide();
        },

        getLocation: function () {
            if (this.defaultLocation) return this.defaultLocation;

            return "bottom";
            // var layout = this.model.get('layout');
            // var rightCoor = layout.get('left') + layout.get('width');

            // var pageHeight = $('#page-wrapper').height();
            // var widgetBottom = layout.get('top') + layout.get('height');

            // if (widgetBottom + 8 > pageHeight) {
            //     if ((12 - rightCoor) < 2) return "left";
            //     return "right";
            // }

            // if (layout.get('height') < 22) {
            //     return "bottom";
            // }

            // if ((12 - rightCoor) < 2) return "left";
            // return "right";
        },

        clickedDelete: function () {
            if (this.model) {
                this.model.remove();
            }
        },

        clicked: function (e) {
            e.stopPropagation();
        },

        mousedown: function (e) {
            mouseDispatcher.isMousedownActive = true;
        },

        mouseup: function () {
            mouseDispatcher.isMousedownActive = false;
        }

    });

    exports.WidgetEditorView = WidgetEditorView;

});

require.define("/template_editor/WidgetSettingsView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';
    require('../mixins/BackboneCardView');

    var GeneratorEditorView = require('../GeneratorEditorView').GeneratorEditorView;
    var TemplatesEditorView = require('../TemplatesEditorView').TemplatesEditorView;
    var WidgetModelEditorView = require('./WidgetModelEditorView').WidgetModelEditorView;

    var tableTemplate = [
        '<div class="header">',
        '<div>',
        '<h2>Widget Settings Editor</h2>',
        '<div class="q-mark-circle"></div>',
        '</div>',
        '<ul class="tabs">',
        '<li class="attributes-li right-icon">',
        '<span>Settings</span>',
        '</li><li class="code-li right-icon">',
        '<span>Generated Code</span>',
        '</li><li class="right-icon info-li">',
        '<span>More Info</span>',
        '</li>',
        '</ul>',
        '</div>',
        '<div class="current-content">',
        '</div>',
    ].join('\n');

    var WidgetSettingsView = Backbone.CardView.extend({

        className: 'widget-settings-pane',
        subviews: [],

        events: {
            'change .attribs': 'changedAttribs',
            'click .q-mark-circle': 'showTableTutorial',
            'click .right-icon': 'tabClicked',
            'keyup .attr-input': 'attributeChanged'
        },


        initialize: function (widgetModel) {
            _.bindAll(this);
            this.model = widgetModel;
        },

        render: function () {
            this.el.innerHTML = _.template(tableTemplate, this.model.serialize());
            this.el.id = 'table-' + this.model.cid;
            this.currentContentPane = this.$el.find('.current-content');
            this.renderAttributes();

            return this;
        },

        reRender: function () {
            this.el.innerHTML = '';
            this.render();
        },

        renderAttributes: function () {

            this.$el.find('.current-content').html('');

            var modelEditorView = new WidgetModelEditorView(this.model);
            this.currentContentPane.append(modelEditorView.render().el);

            this.$el.find('.attributes-li').addClass('active');
        },

        renderCode: function () {
            var tableCodeView = new GeneratorEditorView({
                generate: this.model.generate,
                widgetModel: this.model
            });
            this.$el.find('.current-content').html('');
            this.$el.find('.current-content').append(tableCodeView.render().el);
            this.$el.find('.code-li').addClass('active');
        },

        renderInfo: function () {
            this.$el.find('.current-content').html('');
            this.$el.find('.current-content').append('<p>Documentation about this widget would go here</p>');
            this.$el.find('.info-li').addClass('active');
        },

        tabClicked: function (e) {
            this.$el.find('.active').removeClass('active');

            if ($(e.currentTarget).hasClass('info-li')) {
                this.renderInfo();
            } else if ($(e.currentTarget).hasClass('attributes-li')) {
                this.renderAttributes();
            } else if ($(e.currentTarget).hasClass('code-li')) {
                this.renderCode();
            }
        },

        onClose: function () {
            this.model.trigger('rerender');
        }

    });

    exports.WidgetSettingsView = WidgetSettingsView;

});

require.define("/mixins/BackboneCardView.js",function(require,module,exports,__dirname,__filename,process,global){        Backbone.CardView = Backbone.View.extend({
            width: 800,
            padding: 0,

            bodyEl: null,

            events: {
                'click .modal-bg': 'closeModal',
                'keydown': 'handleKey',
                'click .done': 'closeModal'
            },

            _configure: function (options) {
                Backbone.ModalView.__super__._configure.call(this, options);
                if (options.height) {
                    this.height = options.height;
                }
                this.bodyEl = document.body;
                this.backgroundDiv = this.setupModal();
                this.modalWindow = this.setupModalWindow();
                _.bindAll(this);
            },

            _ensureElement: function (options) {
                Backbone.ModalView.__super__._ensureElement.call(this, options);
            },

            setBodyEl: function (el) {
                this.bodyEl = el;
            },

            setupModal: function () {
                var self = this;
                var div = document.createElement('div');
                div.className = "modal-bg";
                div.style.position = 'fixed';
                div.style.width = '100%';
                div.style.height = '100%';
                div.style.top = '0';
                div.style.left = '0';
                div.style.backgroundColor = '#222';
                div.style.opacity = '0.7';
                div.style.zIndex = 3000;
                this.bodyEl.appendChild(div);

                var closeHandler = function (e) {
                    if (e.keyCode == 27) {
                        self.closeModal(closeHandler);
                    }
                };

                $(div).on('click', function () {
                    self.closeModal(closeHandler);
                });


                $(window).on('keydown', closeHandler);

                return div;
            },

            setupModalWindow: function () {
                var self = this;

                var div = document.createElement('div');
                div.style.position = 'fixed';
                div.className = 'card-view bounceInUp ' + this.className;
                div.style.width = this.width + 'px';
                if (this.height) {
                    div.style.height = this.height + 'px';
                } else {
                    div.style.minHeight = '300px';
                    div.style.maxHeight = '630px';
                }
                div.style.top = '50%';
                div.style.left = '50%';
                div.style.marginLeft = '-' + (this.width / 2) + 'px';
                div.style.marginTop = '-300px';
                div.style.zIndex = 3001;
                div.style.padding = 0;

                if (this.title) {
                    var title = document.createElement('h3');
                    title.innerText = this.title;
                    div.appendChild(title);
                }
                if (this.doneButton) {
                    var qMark = '';
                    if (this.address) {
                        qMark = '<div class="q-mark"></div>';
                    }
                    $(div).append('<div class="bottom-sect">' + qMark + '<div class="btn done">Done</div></div>');
                    $(div).find('.done').on('click', function () {
                        self.closeModal();
                    });
                }

                var span = document.createElement('span');
                span.className = 'modal-down';
                span.style.position = 'absolute';
                span.style.right = '18px';
                span.style.top = '20px';
                span.innerText = '✔';
                span.style.zIndex = '1000';
                div.appendChild(span);

                var content = document.createElement('div');
                content.style.width = '100%';
                if (!this.title) content.style.height = (this.contentHeight || '100%');
                content.style.position = "relative";
                content.style.padding = (this.padding || 0) + 'px';
                div.appendChild(content);

                this.bodyEl.appendChild(div);

                $(span).on('click', function () {
                    self.closeModal();
                });

                this.el = content;
                return div;
            },

            closeModal: function (closeHandlerFn) {
                var self = this;
                this.undelegateEvents();
                if (this.callback) this.callback();
                if (this.onClose) this.onClose();

                $(self.modalWindow).addClass('animated');
                $(self.modalWindow).removeClass('bounceInUp');
                $(self.modalWindow).addClass('bounceOutDown');

                $(self.backgroundDiv).fadeOut();

                setTimeout(function () {
                    self.$el.remove();
                    self.remove();
                    $(self.modalWindow).remove();
                    $(self.backgroundDiv).remove();
                }, 550);

                if (closeHandlerFn) {
                    $(window).unbind('keydown', closeHandlerFn);
                }

                this.close();
            },

            handleKey: function (e) {
                if (e.keyCode == 27) { //escape
                    this.closeModal();
                    e.stopPropagation();
                }
            }

        });

});

require.define("/GeneratorEditorView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var Generator = require('./Generator');

    var GeneratorEditorView = Backbone.View.extend({
        el: null,
        tagName: 'div',
        collection: null,
        parentName: "",
        className: 'code-view',
        subviews: [],

        events: {
            'click .edit-current': 'editCurrentGen',
            'click .fork-current': 'forkCurrentGen',
            'click .clone-button': 'cloneGenerator',
            'click .edit-code': 'editCode'
        },


        initialize: function (options) {
            _.bindAll(this);
            this.model = options.widgetModel;
            this.setupGenerator(options.generate || this.model.generate);
        },

        setupGenerator: function (generatorPath) {
            this.generatorPath = generatorPath;
            this.generator = G.getGenerator(this.generatorPath);
            this.model.setGenerator(generatorPath);
        },

        render: function () {
            this.el.innerHTML = _.template([
                '<div id="name-editor" class="sub-settings">',
                '<div style="line-height: 60px; display:inline-block;">Current Generator: <%= name %></div>',
                '<div class="btn-group right">',
                '<button type="button" class="btn btn-default edit-code">',
                'Edit Code',
                '</button>',
                '<button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown">',
                'Change Generator <span class="caret"></span>',
                '</button>',
                '<ul class="dropdown-menu abs action-menu" role="menu">',
                '<li class="fork-current"><a href="#">Fork Current Generator</a></li>',
                '<li class="divider"></li>',
                '</ul>',
                '</div>',
                '</div>',
                '<div class="generated-code"><%= generatedCode %></div>'
            ].join('\n'), {
                name: this.generatorPath,
                generatedCode: this.getGeneratedCode()
            });


            if (!v1State.get('plugins').isGeneratorEditable(this.generatorPath)) {
                this.$el.find('.edit-code').addClass('disabled');
                this.$el.find('.edit-code').attr('title', 'Native generators cannot be edited. They need to be forked.');
            }
            this.$el.find('.dropdown-toggle').dropdown();
            this.renderCloneButtons();

            this.$el.tooltip();

            return this;
        },

        renderCloneButtons: function () {

            var currentModule = util.packageModuleName(this.generatorPath).module;
            // e.g. if module == uielements, it can only clone uielements
            var generators = v1State.get('plugins').getAllGeneratorsWithModule(currentModule);

            _.each(generators, function (generator) {
                var genPath = [generator.package, currentModule, generator.name].join('.');
                this.$el.find('.action-menu').append('<li class="clone-button" id="' + genPath + '"><a href="#">Switch Generator to ' + generator.name + '</a></li>');
            }, this);
        },

        editCurrentGen: function () {
            alert('todo link to the plugin editor');
        },

        forkCurrentGen: function () {
            // alert('Not yet implemented');

            var self = this;
            var newName = window.prompt("What do you want to name the new generator?", util.packageModuleName(self.generatorPath).name + "_edited");

            if (newName != null) {

                var newPackageModuleName = util.packageModuleName(self.generatorPath);
                newPackageModuleName.name = newName;

                // isNameUnique needs work, plz see function
                if (!v1State.get('plugins').isNameUnique(newPackageModuleName)) {
                    self.forkCurrentGen();
                }

                var genObj = _.clone(this.generator);
                var newGenPath = v1State.get('plugins').fork(this.generatorPath, newName);

                self.setupGenerator(newGenPath);
                self.render();
            } else {
                self.forkCurrentGen();
            }

        },

        getGeneratedCode: function () {
            var string = "";
            try {
                // This will force it to use defaults in the generator
                // console.log('Trying to generate code')
                var gPath = this.generatorPath;
                var generated = this.model.expand();
                console.log(generated);

                if (typeof generated === 'object') {
                    var str = '<div>';

                    _.each(generated, function (val, key) {
                        str += '<h4>' + key + '</h4>';
                        str += '<pre>' + String(val).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + '</pre>';
                    });

                    string = str;
                } else if (typeof generated === 'string') {
                    string = '<pre>' + generated.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + '</pre>';
                }

            } catch (e) {
                string = 'Could not be generated: ' + e;
            }

            return string;
        },

        editCode: function () {
            if (v1State.get('plugins').isGeneratorEditable(this.generatorPath)) {
                var url = "/app/" + appId + "/dev/#" + this.generatorPath;
                window.open(url, "Generator Editor");
            }
        },

        cloneGenerator: function (e) {
            var genPath = String(e.currentTarget.id);
            console.log(genPath);
            this.model.setGenerator(genPath);

            // changes data related to this view and rerenders
            this.generatorPath = genPath;
            this.generator = G.getGenerator(genPath);

            this.render();
        },

    });

    exports.GeneratorEditorView = GeneratorEditorView;

});

require.define("/TemplatesEditorView.js",function(require,module,exports,__dirname,__filename,process,global){'use strict';

var Generator = require('./Generator');

var funcTemplate = [
    '<div class="code-chunk">',
    '<span class="title"><%= name %></span>',
    '<div class="code-editor" id="template-editor-<%= name %>"></div>',
    '</div>'
].join('\n');

var TemplatesEditorView = Backbone.View.extend({
    el: null,
    tagName: 'div',
    collection: null,
    parentName: "",
    className: 'code-view',
    subviews: [],

    events: {
        'click .edit-current': 'editCurrentGen',
        'click .clone-button': 'cloneGenerator'
    },


    initialize: function (options) {
        _.bindAll(this);
        this.widgetModel = options.widgetModel;
        this.generatorName = options.generate;
        this.generator = G.getGenerator(this.generatorName);
    },

    render: function () {
        var strHTML = _.template([
            '<div id="name-editor" class="sub-settings">',
            '<div style="line-height: 60px; display:inline-block;">Current Generator: <%= name %></div>',
            '<div class="btn-group right">',
            '<button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown">',
            'Edit Code <span class="caret"></span>',
            '</button>',
            '<ul class="dropdown-menu abs action-menu" role="menu">',
            '<li><a href="#" class="edit-current">Edit Current Code</a></li>',
            '<li class="divider"></li>',
            '</ul>',
            '</div>',
            '</div>'
        ].join('\n'), {
            name: this.generatorName
        });

        strHTML += '<div class="instance sect">';
        _.each(this.generator.templates, function (val, key) {
            strHTML += _.template(funcTemplate, {
                name: key
            });
        });

        strHTML += [
            '<div id="add-template-box">',
            '<form style="display:none;">',
            '<input type="text" class="property-name-input" placeholder="Template Name...">',
            '<input type="submit" class="done-btn" value="Done">',
            '</form>',
            '<div class="add-button box-button">+ Create a New Template</div>',
            '</div>'
        ].join('\n');

        strHTML += '</div>';

        this.el.innerHTML = strHTML;

        this.$el.find('.dropdown-toggle').dropdown();
        this.addPropertyBox = new Backbone.NameBox({}).setElement(this.$el.find('#add-template-box')).render();
        this.addPropertyBox.on('submit', this.createTemplate);

        this.renderCloneButtons();
        return this;
    },

    reRender: function () {
        this.el.innerHTML = '';
        this.render();
        this.setupAce();
    },

    renderCloneButtons: function () {

        var packageModuleName = expanderfactory(function (code, globals) {}).parseGenID(this.generatorName);
        var plugins = [];

        if (packageModuleName.package != "local" &&
            appState.plugins[packageModuleName.package] &&
            appState.plugins[packageModuleName.package][packageModuleName.module]) {
            plugins = _.map(appState.plugins[packageModuleName.package][packageModuleName.module], function (obj) {
                obj.package = packageModuleName.package;
                return obj;
            });
        }

        if (appState.plugins["local"] &&
            appState.plugins["local"][packageModuleName.module]) {
            var localGens = _.map(appState.plugins["local"][packageModuleName.module], function (obj) {
                obj.package = "local";
                return obj;
            });
            plugins = _.union(plugins, localGens);
        }

        plugins = _.reject(plugins, function (generator) {
            var genName = [packageModuleName.package, packageModuleName.module, generator.name].join('.');
            return genName == this.generatorName;
        }, this);

        _.each(plugins, function (generator) {
            var genName = [generator.package, packageModuleName.module, generator.name].join('.');
            this.$el.find('.action-menu').append('<li class="clone-button" id="' + genName + '"><a href="#">Clone ' + generator.name + 'X</a></li>');
        }, this);
    },

    setupAce: function () {

        var packageModuleName = expanderfactory(function (code, globals) {}).parseGenID(this.generatorName);

        _.each(this.generator.templates, function (val, key) {

            var self = this;
            var editor = ace.edit("template-editor-" + key);
            editor.getSession().setMode("ace/mode/html");
            editor.setValue(String(val), -1);
            editor.on("change", function () {
                self.keyup(editor, key);
            });

            if (packageModuleName.package != "local") {

                editor.setReadOnly(true); // false to make it editable
                editor.setHighlightActiveLine(false);
                editor.setHighlightGutterLine(false);
                editor.renderer.$cursorLayer.element.style.opacity = 0;

            } else {
                editor.setReadOnly(false); // false to make it editable
            }

        }, this);

    },

    editCurrentGen: function () {
        var genObj = _.clone(this.generator);

        var gensWrapper = v1.currentApp.model.get('plugins');
        var packageModuleName = expanderfactory(function (code, globals) {}).parseGenID(this.generatorName);
        packageModuleName.package = 'local';
        gensWrapper.local = gensWrapper.local || {};
        gensWrapper.local[packageModuleName.module] = gensWrapper.local[packageModuleName.module] || [];


        var i = 2;
        var newName = packageModuleName.name + '_v' + i;
        while (!this.isUnique(packageModuleName, newName)) {
            i++;
            newName = packageModuleName.name + '_v' + i;
        }

        packageModuleName.name = newName;

        this.generatorName = [packageModuleName.package,
            packageModuleName.module,
            packageModuleName.name
        ].join('.');

        this.widgetModel.generate = this.generatorName;
        genObj.name = packageModuleName.name;
        this.generator = genObj;

        gensWrapper.local[packageModuleName.module].push(this.generator);
        this.reRender();
    },

    isUnique: function (packageModuleName, name) {
        var gensWrapper = v1.currentApp.model.get('plugins');
        var isUnique = true;
        var gens = gensWrapper.local[packageModuleName.module];
        _.each(gens, function (gen) {
            if (gen.name == name) isUnique = false;
        }, this);

        return isUnique;
    },

    createTemplate: function (name) {
        this.generator.templates[name] = "";
        this.reRender();
    },

    cloneGenerator: function (e) {
        var genPath = String(e.currentTarget.id);
        this.widgetModel.generate = genPath;
        this.generatorName = genPath;
        this.generator = G.getGenerator(this.generatorName);

        this.reRender();
    },

    keyup: function (editor, key) {
        this.generator.templates[key] = editor.getValue();
    }

});

exports.TemplatesEditorView = TemplatesEditorView;

});

require.define("/template_editor/WidgetModelEditorView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var ModelEditorView = require('../ModelEditorView');

    var WidgetModelEditorView = Backbone.View.extend({

        className: 'widget-model-editor-table',
        subviews: [],

        events: {
            'click .switch-json': 'renderJSONAttributes',
            'click .switch-table': 'renderAttributes',
            'click .update-json': 'updateJSON'
        },


        initialize: function (model) {
            _.bindAll(this);
            this.model = model;
            // this.listenTo(this.model, 'change', this.changed);
        },


        render: function (argument) {
            this.renderJSONAttributes();

            return this;
        },

        renderAttributes: function () {

            this.$el.find('.current-content').html('');

            var template = [
                '<div id="name-editor" class="sub-settings">',
                '<div class="btn-group right">',
                '<button type="button" class="btn btn-default switch-json">',
                'JSON View',
                '</button>',
                '</div>',
                '</div>'
            ].join('\n');

            this.$el.html(template);

            var modelEditorView = new ModelEditorView(this.model);
            this.el.appendChild(modelEditorView.render().el);
        },

        renderJSONAttributes: function () {
            this.$el.find('.current-content').html('');

            var template = [
                '<div id="name-editor" class="sub-settings">',
                '<div class="btn-group">',
                '<span class="btn update-json">Update</span>',
                '</div>',
                '<div class="btn-group right">',
                '<button type="button" class="btn btn-default switch-table">',
                'Table View',
                '</button>',
                '</div>',
                '</div>',
                '<div id="json-editor-model" style="height:450px; width: 100%; margin-top:0px;"></div>'
            ].join('\n');

            this.$el.html(template);
            setTimeout(this.setupAce, 300);
        },

        setupAce: function () {
            var json = this.model.toJSON();
            var json_str = JSON.stringify(json, {}, 4);

            this.editor = ace.edit("json-editor-model");
            this.editor.getSession().setMode("ace/mode/json");
            this.editor.setValue(String(json_str), -1);
        },

        updateJSON: function (e) {
            var newJSON = this.editor.getValue();
            var obj = jQuery.parseJSON(newJSON);
            this.model.updateJSON(obj);
            e.currentTarget.innerHTML = 'Updated';
            var timer = setTimeout(function () {
                e.currentTarget.innerHTML = 'Update';
                clearTimeout(timer);
            }, 2000);
        }

    });

    exports.WidgetModelEditorView = WidgetModelEditorView;

});

require.define("/ModelEditorView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var ModelEditorView = Backbone.View.extend({

        className: 'model-editor-table',
        subviews: [],

        tagName: 'table',

        events: {
            'change .attribs': 'changedAttribs',
            'click .right-icon': 'tabClicked',
            'keyup .attr-input': 'attributeChanged',
            'click .remove-attr': 'removeAttribute'
        },


        initialize: function (model) {
            _.bindAll(this);
            this.model = model;
            this.listenTo(this.model, 'change', this.changed);
        },

        render: function (argument) {


            _.each(this.model.attributes, function (val, key) {
                if (Backbone.isModel(val) || Backbone.isCollection(val)) return;
                this.createRow(val, key);
            }, this);

            this.el.insertRow(-1).innerHTML = [
                '<tr><td colspan="3">',
                '<div id="add-attribute-box">',
                '<form style="display:none;">',
                '<input type="text" class="property-name-input" placeholder="Template Name...">',
                '<input type="submit" class="done-btn" value="Done">',
                '</form>',
                '<div class="add-button box-button">+ Add New Attribute</div>',
                '</div>',
                '</td></tr>'
            ].join('\n');


            this.addAttributeBox = new Backbone.NameBox({}).setElement(this.$el.find('#add-attribute-box')).render();
            this.addAttributeBox.on('submit', this.createAttribute);

            return this;
        },

        createRow: function (val, key, ind) {

            ind = ind || -1;
            var row = this.el.insertRow(ind);
            row.id = "attr-" + key;
            row.innerHTML = ['<td>' + key + '</td>',
                '<td><input type="text" class="attr-input" id="inp-' + key + '" value="' + val + '"></td>',
                '<td class="settings"><span class="remove-attr">-</span></td>'
            ].join('\n');

            return row;
        },

        changed: function (e) {

            var changedAttrib = e.changedAttributes();

            _.each(changedAttrib, function (val, key) {

                // Key is Removed
                if (!val && val != "") {
                    this.$el.find('#attr-' + key).remove();
                }
                // Key is New
                else if (this.$el.find('#attr-' + key).length == 0) {
                    var nmrRows = this.el.getElementsByTagName("tr").length;
                    this.createRow(val, key, nmrRows - 1);
                }

            }, this);

        },

        attributeChanged: function (e) {
            var attributeKey = String(e.currentTarget.id).replace('inp-', '');
            this.model.set(attributeKey, e.currentTarget.value);
        },

        createAttribute: function (name) {
            this.model.set(name, '');
        },

        removeAttribute: function (e) {
            var attributeKey = String(e.currentTarget.parentNode.parentNode.id).replace('attr-', '');
            this.model.unset(attributeKey);
        }
    });

    exports.ModelEditorView = ModelEditorView;

});

require.define("/template_editor/WidgetContentEditorView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var SelectView = require('../mixins/SelectView');

    var WidgetContentEditorView = Backbone.View.extend({
        el: document.getElementById('content-editor'),
        className: 'content-editor w-section',
        tagName: 'ul',
        events: {
            'keyup .content-editor': 'changedContent',
            'click #toggle-bold': 'toggleBold',
            'click .change-src-btn': 'clickedChangeSrc',
            'click .change-link-btn': 'clickedChangeHref',
            'change .font-picker': 'changeFont',
            'change .statics': 'changeSrc',
            'change .select-href': 'changeHref',
            'submit #external-link-form': 'addExternalLink'
        },

        initialize: function (widgetModel, parentView) {
            _.bindAll(this);

            this.model = widgetModel;
            this.parentView = parentView;
            this.render();
        },

        render: function () {
            if (this.model.has('src')) {
                this.el.appendChild(this.renderSrcInfo());
            }
            if (this.model.has('href') || this.model.generate == "uielements.design-button") {
                this.el.appendChild(this.renderHrefInfo());
            }
        },

        renderHrefInfo: function () {


            // return this.hrefLi;

            var href = (this.model.get('href') || null);
            var li = document.createElement('li');
            li.className = "w-section change-link-btn";
            if (href) {
                li.innerHTML = "Change Link Target";
            } else {
                li.innerHTML = "Add Link";
            }
            return li;
        },

        renderSrcInfo: function () {
            // var li = document.createElement('li');
            // li.appendChild(new comp().div('Image Source').classN('header-div').el);


            // li.appendChild(selecView.el);
            // 

            var li = document.createElement('li');
            li.className = "w-section change-src-btn";
            li.innerHTML = "Change Image Source";
            return li;
        },

        inputChanged: function (e) {
            e.stopPropagation();
            var hash = e.target.id.replace('prop-', '');
            var info = hash.split('-');

            if (info.length == 2) {
                this.mode.get(info[0]).set(info[1], e.target.value);
            } else if (info.length == 1) {
                this.model.set(info[0], e.target.value);
            }
        },

        changedContent: function (e) {
            this.model.set("content", e.target.value);
        },

        changeFont: function (e) {
            if (!this.model.get('content_attribs').has('style')) {
                this.model.get('content_attribs').set('style', 'font-size:12px;');
            }
            var curStyle = this.model.get('content_attribs').get('style');

            if (/font-size:([^]+);/g.exec(curStyle)) {
                curStyle = curStyle.replace(/(font-size:)(.*?)(;)/gi, e.target.value);
            } else {
                curStyle = curStyle + ' ' + e.target.value;
            }

            this.model.get('content_attribs').set('style', curStyle);
            mouseDispatcher.isMousedownActive = false;
        },

        toggleBold: function (e) {
            var curStyle = (this.model.get('content_attribs').get('style') || '');
            if (curStyle.indexOf('font-weight:bold;') < 0) {
                $('#toggle-bold').addClass('selected');
                curStyle += 'font-weight:bold;';
                this.model.get('content_attribs').set('style', curStyle);
            } else {
                $('#toggle-bold').removeClass('selected');
                curStyle = curStyle.replace('font-weight:bold;', '');
                this.model.get('content_attribs').set('style', curStyle);
            }
        },

        staticsAdded: function (files, self) {
            _(files).each(function (file) {
                file.name = file.filename;
                statics.push(file);
            });
            self.model.set('src', _.last(files).url);
            // self.model.get('data').set('content', _.last(files).url);
        },

        clickedChangeSrc: function () {
            var self = this;

            var statics_list = _.map(statics, function (obj) {
                var newObj = {};
                newObj.val = obj.url;
                newObj.name = obj.name;
                return newObj;
            });

            statics_list = _.union({
                val: "new-image",
                name: "Upload New Image"
            }, statics_list);

            var curValName = this.model.get('src');
            if (this.model.has('src_content')) {
                curValName = this.model.get('content_attribs').get('src_content');
            }
            var curVal = {
                name: curValName,
                val: this.model.get('src')
            };

            var selectView = new SelectView(statics_list, curVal, true, {
                maxHeight: 5
            });

            this.parentView.setTempContent(selectView.el);

            selectView.bind('change', this.changeSrc);
            selectView.bind('change', function () {
                self.parentView.removeTempContent();
            });

            selectView.expand();
        },

        changeSrc: function (inp) {
            var self = this;
            if (inp == 'new-image') {
                top.util.filepicker.openFilePick(self.staticsAdded, self, appId);
            } else {
                this.model.set('src', inp);
                //this.model.set('content', inp);
            }
        },

        clickedChangeHref: function () {
            var self = this;
            var listOfPages = v1.currentApp.model.get('routes').map(function (routeModel) {
                return {
                    name: routeModel.get('name'),
                    val: routeModel.getUrlString()
                };
            });

            var href = (this.model.get('href') || null);

            if (href === null) {
                href = {
                    name: "Currently no Target",
                    val: null
                };
            } else {
                href = {
                    name: href,
                    val: href
                };
            }

            var selectView = new SelectView(listOfPages, href, true, {
                maxHeight: 5
            });

            this.parentView.setTempContent(selectView.el);

            selectView.bind('change', this.changeHref);
            selectView.bind('change', function () {
                self.parentView.removeTempContent();
            });

            selectView.expand();
        },

        changeHref: function (inp) {
            var self = this;
            var target = inp;
            if (target == "External Link") {
                self.hrefLi.innerHTML = '<form id="external-link-form"><input id="external-link-input" type="text" placeholder="http://"></form>';
                $('#external-link-input').focus();
                return;
            }
            // else if (this.model.get('context')) {
            //     target = 'internal://' + target;
            //     target += ('/' + this.model.get('data').get('context'));
            // }
            this.model.set('href', target);
            this.renderHrefInfo();
        },

        addExternalLink: function (e) {
            e.preventDefault();
            var page_link = util.get('external-link-input').value;
            this.model.set('href', page_link);
            $('#external-link-form').remove();
            this.hrefOptions.unshift(page_link);
            this.renderHrefInfo();
        },

        clear: function () {
            this.el.innerHTML = '';
            this.model = null;
            this.remove();
        }
    });

    exports.WidgetContentEditorView = WidgetContentEditorView;

});

require.define("/mixins/SelectView.js",function(require,module,exports,__dirname,__filename,process,global){  SelectView = Backbone.View.extend({
      tagName: 'div',
      className: 'select-view',
      expanded: false,

      events: {
          'click': 'expand',
          'click li': 'select',
          'click .updown-handle': 'toggle'
      },

      initialize: function (list, currentVal, isNameVal, options) {
          _.bindAll(this);

          this.list = list;
          this.currentVal = currentVal;
          this.isNameVal = isNameVal || false;
          this.options = (options || {});
          this.render();
          return this;
      },

      render: function () {
          var self = this;
          var list = document.createElement('ul');

          if (this.currentVal) {
              var currentLi = document.createElement('li');
              currentLi.innerHTML = this.currentVal;
              if (self.isNameVal) {
                  currentLi.innerHTML = this.currentVal.name;
              }
              currentLi.className = 'selected';
              list.appendChild(currentLi);
          }

          _(this.list).each(function (val, ind) {
              if (val == self.currentVal || _.isEqual(val, self.currentVal)) return;
              var li = document.createElement('li');
              li.id = 'li-' + self.cid + '-' + ind;
              val = val;
              if (self.isNameVal) {
                  val = val.name;
              }
              li.innerHTML = val;
              list.appendChild(li);
          });

          var handle = document.createElement('div');
          handle.className = "updown-handle";
          this.handle = handle;

          this.el.appendChild(handle);
          this.el.appendChild(list);

          return this;
      },

      expand: function (e) {
          var length = this.list.length;

          if (this.currentVal && !_.contains(this.list, this.currentVal)) {
              length += 1;
          }

          if (this.options.maxHeight && length > this.options.maxHeight) length = this.options.maxHeight;

          this.el.style.height = length * 40 + 'px';
          this.expanded = true;
          if (e) e.stopPropagation();
      },

      shrink: function (e) {
          this.el.style.height = 40 + 'px';
          this.expanded = false;
          e.stopPropagation();
      },

      select: function (e) {
          this.shrink(e);
          if (e.target.className == "selected") return;
          var ind = String(e.target.id).replace('li-' + this.cid + '-', '');
          this.trigger('change', this.list[ind].val);
      },

      selectCurrent: function () {
          this.trigger('change', this.currentVal);
      },

      toggle: function (e) {
          if (this.expanded) this.shrink(e);
          else this.expand(e);
      }

  });

  exports.SelectView = SelectView;

});

require.define("/template_editor/WidgetLayoutEditorView.js",function(require,module,exports,__dirname,__filename,process,global){var WidgetClassPickerView = require('./WidgetClassPickerView').WidgetClassPickerView;

var ToolTipHints = {
    "a-left": "Align left",
    "a-center": "Align center",
    "a-right": "Align right",
    "padding-tb": "Top-Bottom Padding",
    "padding-lr": "Left-Right Padding",
    "pick-style": "Click to add a style"
};


var WidgetLayoutEditorView = Backbone.View.extend({
    el: document.getElementById('layout-editor'),
    className: 'w-section layout-editor',
    events: {
        'click .a-pick': 'changeAlignment',
        'click .padding': 'changePadding',
        'click #delete-widget': 'deleteWidget',
        'mouseover .tt': 'showToolTip',
        'mouseout .tt': 'hideToolTip'
    },

    initialize: function (widgetModel) {
        _.bindAll(this);

        this.model = widgetModel;
        this.render();
    },


    changeAlignment: function (e) {
        $('.selected', '.alignment-picker').removeClass('selected');
        var direction = (e.target.className).replace(' a-pick', '');
        direction = direction.replace(' tt', '');
        direction = direction.replace('a-', '');

        this.model.get('layout').set('alignment', direction);
        e.target.className += ' selected';
    },

    changePadding: function (e) {
        var padding = (e.target.id).replace('padding-', '');
        $(e.target).toggleClass('selected');


        if (padding == "tb") {
            if ($(e.target).hasClass('selected')) {
                this.model.get('layout').set('t_padding', 15);
                this.model.get('layout').set('b_padding', 15);
            } else {
                this.model.get('layout').set('t_padding', 0);
                this.model.get('layout').set('b_padding', 0);
            }
        } else {
            if ($(e.target).hasClass('selected')) {
                this.model.get('layout').set('r_padding', 15);
                this.model.get('layout').set('l_padding', 15);
            } else {
                this.model.get('layout').set('r_padding', 0);
                this.model.get('layout').set('l_padding', 0);
            }
        }
    },

    render: function () {
        var self = this;
        this.el.appendChild(this.renderPaddingInfo());
        this.el.appendChild(this.renderLayoutInfo());
    },

    renderLayoutInfo: function () {
        var aLeft = this.model.has('layout') && this.model.get('layout').get('alignment') == "left" ? " selected" : "";
        var aCenter = this.model.has('layout') && this.model.get('layout').get('alignment') == "center" ? " selected" : "";
        var aRight = this.model.has('layout') && this.model.get('layout').get('alignment') == "right" ? " selected" : "";

        var div = document.createElement('div');
        div.className = "alignment-picker";
        div.innerHTML += '<div class="a-left a-pick tt' + aLeft + '" id="a-left"></div><div class="a-center a-pick tt' + aCenter + '" id="a-center"></div><div class="a-right a-pick tt' + aRight + '" id="a-right"></div>';
        return div;
    },

    renderPaddingInfo: function () {
        var paddingLR = this.model.has('layout') && this.model.get('layout').get('r_padding') > 0 ? "selected" : "";
        var paddingTB = this.model.has('layout') && this.model.get('layout').get('b_padding') > 0 ? "selected" : "";

        var div = document.createElement('div');
        div.className = "padding-picker right";
        div.innerHTML += '<div class="padding tb tt ' + paddingTB + '" id="padding-tb"></div><div class="padding lr tt ' + paddingLR + '" id="padding-lr"></div>';
        return div;
    },

    showToolTip: function (e) {
        if (this.toolTip) {
            $(this.toolTip).remove();
        }

        var div = document.createElement('div');
        div.className = "tool-tip-box fadeIn";
        var text = ToolTipHints[e.target.id];
        if (text) {
            div.innerHTML = text;
            this.toolTip = div;
            this.el.appendChild(div);
        }

    },

    hideToolTip: function (e) {
        if (this.toolTip) {
            $(this.toolTip).remove();
        }
    },

    deleteWidget: function () {
        this.model.remove();
    },

    clear: function () {
        this.el.innerHTML = '';
        this.model = null;
        this.remove();
    }
});

exports.WidgetLayoutEditorView = WidgetLayoutEditorView;

});

require.define("/template_editor/WidgetClassPickerView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var SelectView = require('../mixins/SelectView').SelectView;

    var WidgetClassPickerView = SelectView.extend({
        className: 'class-picker select-view',
        id: 'class-editor',
        tagName: 'div',
        css: 'widget-editor',

        events: {
            'click li': 'select',
            'click .updown-handle': 'selectCurrent',
            'mouseover li': 'hovered',
            'mouseover .updown-handle': 'hovered'
        },

        initialize: function (widgetModel) {
            _.bindAll(this);

            this.model = widgetModel;
            var type = this.model.get('type');
            var currentClass = this.model.get('className');
            var currentVal = -1;

            var els = top.v1UIEState.getUIEVals(type).toJSON();

            this.list = _.map(els, function (obj, key) {
                if (obj.class_name == currentClass) {
                    currentVal = key;
                }
                return {
                    name: obj.class_name,
                    val: key
                };
            });

            this.uieVals = els;
            this.isNameVal = true;

            if (currentClass == "") {
                currentClass = '<i>No Class Selected</i>';
            };
            this.currentVal = {
                name: currentClass,
                val: currentVal
            };

            this.render();
        },

        render: function () {
            WidgetClassPickerView.__super__.render.call(this);
            this.expand();
            this.hide();
        },

        hovered: function (e) {
            if (e.currentTarget.className == "updown-handle" && this.uieVals[this.currentVal.val]) {
                this.model.set('tagName', this.uieVals[this.currentVal.val].tagName);
                this.model.set('className', this.uieVals[this.currentVal.val].class_name);
                return;
            }

            if (!this.list[ind]) return;

            var ind = String(e.currentTarget.id).replace('li-' + this.cid + '-', '');
            this.model.set('tagName', this.uieVals[this.list[ind].val].tagName);
            this.model.set('className', this.uieVals[this.list[ind].val].class_name);
        },

        show: function () {
            this.$el.fadeIn();
        },

        hide: function () {
            this.$el.hide();
        }
    });

    exports.WidgetClassPickerView = WidgetClassPickerView;

});

require.define("/template_editor/CustomWidgetEditorModal.js",function(require,module,exports,__dirname,__filename,process,global){    require('../mixins/BackboneCardView');


    var CustomWidgetEditorModal = Backbone.CardView.extend({
        className: 'custom-widget-editor',
        padding: 0,
        title: "Custom Widget Editor",
        // doneButton: true,

        events: {
            'click .sub-title': 'toggle',
        },

        initialize: function (widgetModel) {
            _.bindAll(this);
            this.model = widgetModel;
            this.render();
        },

        render: function () {
            var self = this;
            var htmlStr = this.model.get('htmlC') || '';
            var cssStr = this.model.get('cssC') || '';
            var jsStr = this.model.get('jsC') || '';

            var content = [
                '<div class="sect"><div class="sub-title" id="e-html">» HTML</div><div id="edit-html-inp" style="background-color:#eee; height: 400px; width:100%; position:relative;"></div></div>',
                '<div class="sect"><div class="sub-title" id="e-js">» JS</div><div id="edit-js-inp" style="position:relative; background-color:#eee; height: 400px; width:100%;"></div></div>',
                '<div class="sect"><div class="sub-title" id="e-css">» CSS</div><div id="edit-css-inp" style="position:relative; background-color:#eee; height: 400px; width:100%;"></div></div>',
                '<a style="position: relative; width:100%; display:block; text-align: center; padding: 8px; color: #666; margin-top:20px;" href="/resources/tutorials/custom-widget/" rel="external" target="_blank">Guide on using the Custom Widget</a>'
            ].join('\n');

            this.el.innerHTML = content;
            this.el.style.overflow = "hidden";

            this.editors = {};

            this.editors["e-css"] = ace.edit("edit-css-inp");
            this.editors["e-css"].getSession().setMode("ace/mode/css");
            this.editors["e-css"].setValue(cssStr, -1);

            this.editors["e-html"] = ace.edit("edit-html-inp");
            this.editors["e-html"].getSession().setMode("ace/mode/html");
            this.editors["e-html"].setValue(htmlStr, -1);

            this.editors["e-js"] = ace.edit("edit-js-inp");
            this.editors["e-js"].getSession().setMode("ace/mode/javascript");
            this.editors["e-js"].setValue(jsStr, -1);

            return this;
        },

        toggle: function (e) {
            if ($(e.currentTarget.parentNode).hasClass('expanded')) return this.shrink(e);
            this.$el.find('.expanded').removeClass('expanded');
            $(e.currentTarget.parentNode).addClass('expanded');
            this.editors[e.currentTarget.id].focus();
        },

        shrink: function (e) {
            $(e.currentTarget.parentNode).removeClass('expanded');
        },

        onClose: function () {
            this.model.set('cssC', this.editors["e-css"].getValue());
            this.model.set('jsC', this.editors["e-js"].getValue());
            this.model.set('htmlC', this.editors["e-html"].getValue());
            this.model.trigger('custom_edited');
        }

    });

    exports.CustomWidgetEditorModal = CustomWidgetEditorModal;

});

require.define("/template_editor/EditorGalleryView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var EditorGallerySectionView = require('./EditorGallerySectionView').EditorGallerySectionView;
    var SearchGallerySectionView = require('./SearchGallerySectionView').SearchGallerySectionView;
    var WidgetModel = require('../models/WidgetModel').WidgetModel;
    var Searcher = require('./Searcher').Searcher;
    var AutoFillHelper = require('../AutoFillHelper').AutoFillHelper;

    /* uielement.displayProps is an an optional object with keys:
        name, (display name)
        iconType, (see validIconClasses below)
        halfWidth (true/false. default false if not exists)
    */
    /* uielement.displayProps.iconType may be one of these values, which happen to be class names for sprites . */
    var validIconClasses = ['button', 'image', 'header', 'text',
        'link', 'line', 'box', 'imageslider',
        'fbshare', 'embedvideo', 'custom-widget'
    ];

    var EditorGalleryView = Backbone.View.extend({

        el: util.get('top-panel-bb'),
        allList: util.get('all-list'),

        curId: 'all-elements',
        dragActive: false,
        slideDownActive: false,

        sections: [],
        subviews: [],

        editorContext: "Page",

        events: {
            'change input.search': 'searchInputChage',
            'click .search-icon': 'searchToggle',
            'keyup input.search': 'searchInputChage',
            'click .search-cancel': 'searchCanceled'
        },

        initialize: function (sectionsCollection) {
            _.bindAll(this);

            this.sectionsCollection = sectionsCollection;

            this.searcher = new Searcher();

            this.sections = [];
            this.subviews = [];
        },

        render: function () {
            var self = this;
            this.setElement(util.get('top-panel-bb'));

            this.allList = util.get('all-list');
            this.allList.innerHTML = '';
            this.renderSearchPart();
            /* To see the old random render<Type>Elements, refer to 4b40213136b3006bf7eb83b3e93998d81c71346b or prior. */
            this.renderPluginElements();

            // hide all sections except first
            this.hideAllSections();
            this.bindDraggable();


            // TODO figure out what to do about this.
            // this.listenTo(v1State.get('models'), 'add remove', this.renderEntityFormsTablesLists);
            this.listenTo(v1State.get('plugins'), 'change', this.renderPluginElements);

            return this;
        },

        bindDraggable: function () {
            var self = this;

            $(this.allList).find('li:not(.ui-draggable)').draggable({
                cursor: "move",
                helper: "clone",
                start: function (e) {
                    self.dragActive = true;
                    v1.currentApp.view.sectionShadowView.displayColumnShadows();
                },
                stop: function (e) {
                    self.dragActive = false;
                    v1.currentApp.view.sectionShadowView.hideColumnShadows();
                    self.hideAllSections();
                },
                iframeFix: true
            });

        },

        renderSearchPart: function () {

            var self = this;
            var sectionView = new SearchGallerySectionView({
                parentView: self
            });

            sectionView.name = name;
            this.searchSection = sectionView;

            this.subviews.push(sectionView);
            this.sections.push(sectionView);
            this.allList.appendChild(sectionView.render().el);
        },

        searchToggle: function () {
            if (this._search_expanded)
                this.searchCanceled();
            else
                this.searchHovered();
        },

        searchHovered: function () {
            $(".search-panel").addClass("hover");
            $('.search').focus();
            this._search_expanded = true;
        },

        searchCanceled: function () {
            $(".search-panel").removeClass("hover");
            $('.search').val('');
            $('.search').focusout();
            this._search_expanded = false;
        },

        searchInputChage: function (e) {

            var val = e.currentTarget.value;

            if (val === "") {
                this.searchSection.clear();
                $(".search-panel").removeClass("hover");
                return;
            } else {
                $(".search-panel").addClass("hover");
            }

            this.searchSection.clear();
            var results = this.searcher.search(val);

            if (results.length > 0) {
                this.searchSection.expand();
            } else {
                this.searchSection.hide();
            }

            _.each(results, function (result) {
                this.searchSection.addWidgetItem(result.id, result.className, result.text, result.icon);
            }, this);

        },

        /* To see the old random render<Type>Elements, refer to 4b40213136b3006bf7eb83b3e93998d81c71346b or prior. */
        renderPluginElements: function () {
            var elements = [];
            var createdSections = [];

            var plugins = v1State.get('plugins').getAllPluginsSerialized();
            var pluginPairs = _.pairs(_.omit(plugins, ['root', 'crud']));

            // order should be root, crud, then rest.
            if (plugins["crud"]) {
                pluginPairs.unshift(["crud", plugins["crud"]]);
            }

            if (plugins["root"]) {
                pluginPairs.unshift(["root", plugins["root"]]);
            }

            _.each(pluginPairs, function (pair) {
                var pluginName = pair[0],
                    plugin = pair[1];
                if (plugin.uielements) {
                    var displayName = plugin.metadata.displayName || pluginName;

                    var sect = this.addNewSection(displayName);
                    createdSections.push(sect);

                    _.each(plugin.uielements, function (element) {
                        var className = null || 'plugin-icon';
                        if (element.displayProps && _.contains(validIconClasses, element.displayProps.iconType)) {
                            className = element.displayProps.iconType;
                        }
                        var displayName = element.name;
                        if (element.displayProps && element.displayProps.name) {
                            displayName = element.displayProps.name;
                        }
                        var fullWidth = true;
                        if (element.displayProps && element.displayProps.halfWidth) {
                            fullWidth = false;
                        }

                        var genIDStr = pluginName + ".uielements." + element.name;
                        sect.addWidgetItem('', 'uielement', displayName, className, genIDStr, fullWidth);
                    }, this);
                }

            }, this);

            _.each(this.pluginSections, function (sect) {
                sect.close();
            });

            this.pluginSections = createdSections;

            if (this.plusSign)
                this.allList.removeChild(this.plusSign);
            this.addPlusSign();
            this.bindDraggable();
        },

        addNewSection: function (name) {

            var self = this;
            var sectionView = new EditorGallerySectionView({
                parentView: self,
                index: this.nmrSections
            });

            this.nmrSections++;

            sectionView.addSearcher(this.searcher);

            sectionView.name = name;
            this.subviews.push(sectionView);
            this.sections.push(sectionView);
            this.allList.appendChild(sectionView.render().el);
            return sectionView;
        },

        addPlusSign: function () {
            var text = "You can add more functionality by installing new Plugins from the menu on the top right.";
            var div = document.createElement('div');
            div.className = "gallery-section plus-sign";
            div.innerHTML = '<div class="gallery-header" title="' + text + '"><span>+</span></div>';
            this.plusSign = div;
            this.allList.appendChild(div);

            $(div).tooltip({
                position: {
                    my: "left+10 center",
                    at: "right center",
                    // using: function(position, feedback) {
                    //     $(this).css(position);
                    //     $("<div>")
                    //         .addClass("arrow")
                    //         .addClass(feedback.vertical)
                    //         .addClass(feedback.horizontal)
                    //         .appendTo(this);
                    // }
                }
            });
        },

        removeSection: function (sectionView) {
            sectionView.close();
            this.sections.splice(this.sections.indexOf(sectionView), 1);
            this.subviews.splice(this.subviews.indexOf(sectionView), 1);
        },

        expandSection: function (index) {
            this.sections[index].expand();
        },

        hideSection: function (index) {
            this.sections[index].hide();
        },

        expandAllSections: function () {
            _(this.sections).each(function (section) {
                section.expand();
            });
        },

        hideAllSections: function () {
            _(this.sections).each(function (section) {
                section.hide();
            });
        },

        slideDown: function () {
            var self = this;
            var itemGallery = document.getElementById('item-gallery');
            var h = $(itemGallery).scrollTop();
            this.slideDownActive = true;
            $(itemGallery).scrollTop(h + 14);
            var tmr = setTimeout(function () {
                self.slideDownActive = false;
                clearTimeout(tmr);
            }, 200);
        },

        hide: function () {
            this.$el.hide();
        },

        show: function () {
            this.$el.fadeIn();
        }

    });


    exports.EditorGalleryView = EditorGalleryView;

});

require.define("/template_editor/EditorGallerySectionView.js",function(require,module,exports,__dirname,__filename,process,global){'use strict';

var WidgetContainerModel = require('../models/WidgetContainerModel');
var WidgetModel = require('../models/WidgetModel');

var EditorGallerySectionView = Backbone.View.extend({

    events: {
        'click .gallery-header .qmark': 'showSectionTutorial',
        'click .gallery-header': 'toggle'
    },

    className: 'gallery-section',
    isExpanded: true,
    timer: null,

    initialize: function (options) {
        _.bindAll(this);
        this.parentView = options.parentView;
        this.options = options;
        return this;
    },

    render: function () {
        if (this.el) {
            this.el.innerHTML = '';
        }
        var sectionName = this.name.replace(/ /g, '-');
        this.header = this.addHeaderItem(this.name);
        this.listWrapper = document.createElement('div');
        this.listWrapper.className = "elements-panel ";

        this.list = document.createElement('ul');
        if (this.options.index > -1) {
            this.listWrapper.className += 'top' + this.options.index;
        }

        this.listWrapper.appendChild(this.list);
        this.list.style = '';
        this.el.appendChild(this.listWrapper);

        return this;
    },

    addWidgetItem: function (id, className, text, icon, generatorIdentifier, fullWidth) {
        // if fullWidth is truthy, creates a full width item. Otherwise creates half width.
        var li = document.createElement('li');
        li.className = fullWidth ? className + ' full-width' : className + ' half-width';
        li.id = id;
        var tempLi = '<span class="icon <%= icon %>"></span><span class="name"><%= text %></span>';
        li.innerHTML = _.template(tempLi, {
            text: text,
            icon: icon
        });

        if (generatorIdentifier) {
            $(li).data('genpath', generatorIdentifier);
        }

        this.list.appendChild(li);

        if (this.searcher) {
            this.searcher.register(id, className, text, icon);
        }

        return li;
    },

    addHeaderItem: function (text, target) {
        var li = document.createElement('div');
        li.className = 'gallery-header open';
        li.innerHTML = '<span>' + text + '</span>';
        // + '<span class="qmark">?</span>';
        var icon = document.createElement('img');
        icon.className = "icon";
        icon.src = STATIC_URL + "/img/right-arrow.png";
        // li.appendChild(icon);
        this.el.appendChild(li);
        return li;
    },

    toggle: function () {
        if (this.isExpanded) this.hide();
        else {
            this.parentView.hideAllSections();
            this.expand();
        }
    },

    expand: function () {
        this.header.className += ' open';
        this.listWrapper.className += ' open';

        this.isExpanded = true;
        $(window).on('mouseup', this.clickedOutsideHide);
    },

    hide: function () {
        $(this.header).removeClass('open');
        $(this.listWrapper).removeClass('open');
        this.isExpanded = false;
        $(window).off('mouseup', this.clickedOutsideHide);
    },

    /* Dead code as of 2/10/14
    mouseleave: function(e) {
        if (this.timer) clearTimeout(this.timer);
        var self = this;
        this.timer = setTimeout(this.checkToHide, 130);
    },
    */
    clickedOutsideHide: function (e) {
        var container = this.$el;
        // if the target of the click isn't the container
        // ... nor a descendant of the container
        if (!container.is(e.target) && container.has(e.target).length === 0) {
            this.hide();
        }
    },

    checkToHide: function () {
        if (this.timer) clearTimeout(this.timer);
        if (!this.parentView.dragActive && !this.parentView.slideDownActive) return this.hide();
        this.timer = setTimeout(this.checkToHide, 2000);
    },

    showSectionTutorial: function (e) {
        e.stopPropagation();
        v1.showTutorial(this.name);
    },

    addSearcher: function (searcherObj) {
        this.searcher = searcherObj;
    }

});


exports.EditorGallerySectionView = EditorGallerySectionView;

});

require.define("/models/WidgetContainerModel.js",function(require,module,exports,__dirname,__filename,process,global){    var WidgetModel = require('./WidgetModel').WidgetModel;
    var LoginRouteCollection = require('../collections/LoginRouteCollection').LoginRouteCollection;


    var WidgetContainerModel = WidgetModel.extend({

        initialize: function (bone, isNew) {
            WidgetContainerModel.__super__.initialize.call(this, bone, isNew);
        },

        createLoginRoutes: function () {
            this.get('data').set('loginRoutes', new LoginRouteCollection());
            v1State.get('users').each(function (userModel) {
                this.get('data').get('loginRoutes').push({
                    role: userModel.get('name'),
                    redirect: "internal://Homepage"
                });
            }, this);
        },

        createSearchTarget: function () {
            v1State.get('pages').each(function (pageM) {
                console.log(pageM.hasSearchList());
                if (pageM.hasSearchList(this.get('data').get('searchQuery').get('searchOn')) && pageM.isContextFree()) {
                    this.get('data').get('searchQuery').set('searchPage', pageM.getDataLang());
                }
            }, this);
        },

        serialize: function () {
            var json = _.clone(this.attributes);

            json.layout = this.get('layout').serialize();
            json.data = this.get('data').serialize();
            if (json.context) delete json.context;

            return json;
        }
    });

    exports.WidgetContainerModel = WidgetContainerModel;

});

require.define("/collections/LoginRouteCollection.js",function(require,module,exports,__dirname,__filename,process,global){  var LoginRouteCollection = Backbone.Collection.extend({

      initialize: function () {
          v1State.get('users').bind('change add remove', this.reorganize, this);
      },

      findRouteWithRole: function (roleStr) {
          var val = null;
          this.each(function (userRole) {
              if (userRole.get('role') == roleStr) {
                  val = userRole.get('redirect');
                  return val;
              }
          }, this);
          return "internal://Homepage";
      },

      reorganize: function () {
          var newContent = [];
          v1State.get('users').each(function (user) {
              var val = this.findRouteWithRole(user.get('name'));
              newContent.push({
                  role: user.get('name'),
                  redirect: val
              });
          }, this);

          this.reset(newContent);
      }

  });

  exports.LoginRouteCollection = LoginRouteCollection;

});

require.define("/template_editor/SearchGallerySectionView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var EditorGallerySectionView = require('./EditorGallerySectionView').EditorGallerySectionView;

    var SearchGallerySectionView = EditorGallerySectionView.extend({

        className: 'search elements-panel',

        render: function () {
            if (this.el) {
                this.el.innerHTML = '';
            }
            this.list = document.createElement('ul');
            this.el.appendChild(this.list);
            this.list.style = '';

            return this;
        },

        expand: function () {
            if (this.isExpanded) return;
            this.$el.addClass("open");
            this.isExpanded = true;
        },

        hide: function () {
            if (!this.isExpanded) return;
            this.isExpanded = false;
            this.$el.removeClass("open");
        },

        clear: function () {
            this.list.innerHTML = '';
        }

    });


    exports.SearchGallerySectionView = SearchGallerySectionView;

});

require.define("/template_editor/Searcher.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    function Searcher() {

        this.items = [];

        this.register = function (id, className, text, icon) {
            this.items.push({
                id: id,
                className: className,
                text: text,
                icon: icon
            });
        };

        this.search = function (str) {

            var results = [];
            _.each(this.items, function (item) {
                if (item.text.toLowerCase().indexOf(str.toLowerCase()) > -1) {
                    results.push(item);
                }
            });

            return results;
        };


    }

    exports.Searcher = Searcher;

});

require.define("/AutoFillHelper.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var AutoFiller = {

        fillUIElement: function (model) {

            var extraData = {};

            var type = model.get('className');

            if (v1UIEState.getBaseClass(type)) {
                extraData.className = v1UIEState.getBaseClass(type);
            }

            if (type == "image") {
                extraData.src = this.stockPhotos[Math.floor(Math.random() * this.stockPhotos.length)];
            }

            if (type == "text") {
                extraData.content = this.loremIpsum();
            }

            return extraData;
        },

        stockPhotos: [
            "https://i.istockimg.com/file_thumbview_approve/19012355/2/stock-photo-19012355-world-globe-on-a-school-desk.jpg",
            "https://i.istockimg.com/file_thumbview_approve/21149086/2/stock-photo-21149086-futuristic-digital-tablet-in-the-hands.jpg",
            "https://i.istockimg.com/file_thumbview_approve/20571269/2/stock-illustration-20571269-school-grunge-pattern.jpg",
            "https://i.istockimg.com/file_thumbview_approve/18120560/2/stock-photo-18120560-students-at-computer-class.jpg",
            "https://i.istockimg.com/file_thumbview_approve/17096161/2/stock-photo-17096161-chalkboard-with-book.jpg",
            "https://i.istockimg.com/file_thumbview_approve/3516561/2/stock-photo-3516561-back-to-school-with-copyspace.jpg"
        ],

        loremIpsum: function () {
            var loremIpsumWordBank = new Array("lorem", "ipsum", "dolor", "sit", "amet,", "consectetur", "adipisicing", "elit,", "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore", "magna", "aliqua.", "enim", "ad", "minim", "veniam,", "quis", "nostrud", "exercitation", "ullamco", "laboris", "nisi", "ut", "aliquip", "ex", "ea", "commodo", "consequat.", "duis", "aute", "irure", "dolor", "in", "reprehenderit", "in", "voluptate", "velit", "esse", "cillum", "dolore", "eu", "fugiat", "nulla", "pariatur.", "excepteur", "sint", "occaecat", "cupidatat", "non", "proident,", "sunt", "in", "culpa", "qui", "officia", "deserunt", "mollit", "anim", "id", "est", "laborum.", "sed", "ut", "perspiciatis,", "unde", "omnis", "iste", "natus", "error", "sit", "voluptatem", "accusantium", "doloremque", "laudantium,", "totam", "rem", "aperiam", "eaque", "ipsa,", "quae", "ab", "illo", "inventore", "veritatis", "et", "quasi", "architecto", "beatae", "vitae", "dicta", "sunt,", "explicabo.", "nemo", "enim", "ipsam", "voluptatem,", "quia", "voluptas", "sit,", "aspernatur", "aut", "odit", "aut", "fugit,", "sed", "quia", "consequuntur", "magni", "dolores", "eos,", "qui", "ratione", "voluptatem", "sequi", "nesciunt,", "neque", "porro", "quisquam", "est,", "qui", "dolorem", "ipsum,", "quia", "dolor", "sit,", "amet,", "consectetur,", "adipisci", "velit,", "sed", "quia", "non", "numquam", "eius", "modi", "tempora", "incidunt,", "ut", "labore", "et", "dolore", "magnam", "aliquam", "quaerat", "voluptatem.", "ut", "enim", "ad", "minima", "veniam,", "quis", "nostrum", "exercitationem", "ullam", "corporis", "suscipit", "laboriosam,", "nisi", "ut", "aliquid", "ex", "ea", "commodi", "consequatur?", "quis", "autem", "vel", "eum", "iure", "reprehenderit,", "qui", "in", "ea", "voluptate", "velit", "esse,", "quam", "nihil", "molestiae", "consequatur,", "vel", "illum,", "qui", "dolorem", "eum", "fugiat,", "quo", "voluptas", "nulla", "pariatur?", "at", "vero", "eos", "et", "accusamus", "et", "iusto", "odio", "dignissimos", "ducimus,", "qui", "blanditiis", "praesentium", "voluptatum", "deleniti", "atque", "corrupti,", "quos", "dolores", "et", "quas", "molestias", "excepturi", "sint,", "obcaecati", "cupiditate", "non", "provident,", "similique", "sunt", "in", "culpa,", "qui", "officia", "deserunt", "mollitia", "animi,", "id", "est", "laborum", "et", "dolorum", "fuga.", "harum", "quidem", "rerum", "facilis", "est", "et", "expedita", "distinctio.", "Nam", "libero", "tempore,", "cum", "soluta", "nobis", "est", "eligendi", "optio,", "cumque", "nihil", "impedit,", "quo", "minus", "id,", "quod", "maxime", "placeat,", "facere", "possimus,", "omnis", "voluptas", "assumenda", "est,", "omnis", "dolor", "repellendus.", "temporibus", "autem", "quibusdam", "aut", "officiis", "debitis", "aut", "rerum", "necessitatibus", "saepe", "eveniet,", "ut", "et", "voluptates", "repudiandae", "sint", "molestiae", "non", "recusandae.", "itaque", "earum", "rerum", "hic", "tenetur", "a", "sapiente", "delectus,", "aut", "reiciendis", "voluptatibus", "maiores", "alias", "consequatur", "aut", "perferendis", "doloribus", "asperiores", "repellat");
            var minWordCount = 15;
            var maxWordCount = 100;

            var randy = Math.floor(Math.random() * (maxWordCount - minWordCount)) + minWordCount;
            var ret = "";
            for (var i = 0; i < randy; i++) {
                var newTxt = loremIpsumWordBank[Math.floor(Math.random() * (loremIpsumWordBank.length - 1))];
                if (ret.substring(ret.length - 1, ret.length) == "." || ret.substring(ret.length - 1, ret.length) == "?") {
                    newTxt = newTxt.substring(0, 1).toUpperCase() + newTxt.substring(1, newTxt.length);
                }
                ret += " " + newTxt;
            }
            return ret;
        },

        fillCreateForm: function (argument) {
            // body...
        }
    }

    exports.AutoFiller = AutoFiller;

});

require.define("/pages/PageView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var UrlView = require('../pages/UrlView');
    var SimpleModalView = require('../mixins/SimpleModalView');
    var DialogueView = require('../mixins/DialogueView');
    var HeaderEditorView = require('../pages/HeaderEditorView');

    var tempPage = [
        '<div class="top-row">',
        '<div class="cross" id="close-page-info">×</div>',
        '<div class="title"><%= page_name %> Info</div>',
        '</div>',
        '<div class="page-menu">',
        '<a class="delete item" <% if(disable_edit) { %>style="color: #999"<% } %>><i class="icon-delete"></i>Delete Page</a>',
        '<div class="edit-url item" <% if(disable_edit) { %>style="color: #999"<% } %>><i class="icon-url"></i>Edit URL</div>',
        '<div class="edit-header item" <% if(disable_edit) { %>style="color: #999"<% } %>><i class=""></i>Edit Header</div>',
        '<span class="context-text edit-url"><%= context_text %></span>',
        '</div>'
    ].join('\n');

    var tempMenu = [
        '<span class="span24 hi6">',
        '<h4 class="hi2 span12 hoff1 offset2">Access Level</h4>',
        '<select class="span12 offset2" id="access_level">',
        '<option <% if(access_level == \'all\') { %> selected <% } %> value="all">Everyone</option>',
        '<option <% if(access_level == \'users\') { %> selected <% } %> value="users">All Users</option>',
        // '<% _.each(user_roles, function(role) { %>',
        //   '<option <% if(access_level == role) { %> selected <% } %> value="<%=role%>">Only <%= role %></option>',
        // '<% }); %>',
        '</select>',
        '</div>'
    ].join('\n');


    var PageView = Backbone.View.extend({
        el: null,
        tagName: 'li',
        className: 'page-view hoff2 offsetr1 pane hi22',
        expanded: false,
        events: {
            'click .delete': 'deletePage',
            'change #access_level': 'accessLevelChanged',
            'click .edit-url': 'renderUrl',
            'click .edit-header': 'clickedEditHeader'
        },

        initialize: function (routeModel, templateModel, ind, isMobile) {
            _.bindAll(this);

            if (routeModel !== null) {
                this.model = routeModel;
                this.ind = ind;
                this.isMobile = isMobile;
                this.urlModel = routeModel.get('url');
                this.listenTo(this.model, 'remove', this.close, this);

                this.templateModel = templateModel;
            }
        },

        render: function () {
            if (!this.model) {
                this.el.innerHTML += 'This template has no route. Please add one if you wish to use this template as a page.';
            } else {
                var page_context = {};
                page_context.page_name = this.model.get('name');
                page_context.ind = this.ind;
                page_context.context_text = this.model.getContextSentence();
                // if this is the homepage view,
                // mark 'edit url' link as disabled
                page_context.disable_edit = (this.model.get('name') === 'Homepage') ? true : false;

                var page = _.template(tempPage, page_context);
                this.el.innerHTML += page;

                this.renderMenu();
                return this;
            }
        },

        renderUrl: function () {
            if (!this.model) {
                // homepage url can't be edited
                if (this.model.get('name') === 'Homepage') {
                    return false;
                }
                var newView = new UrlView(this.urlModel, this.model);
            }
        },

        renderMenu: function () {
            var page_context = {};
            page_context = this.model.attributes;
            page_context.page_name = this.model.get('name');
            page_context.ind = this.ind;

            //var page = _.template(tempMenu, page_context);
            var span = document.createElement('span');
            //span.innerHTML = page;
            span.innerHTML = "There will be more info here";

            this.el.appendChild(span);
        },

        accessLevelChanged: function (e) {
            this.model.set('access_level', e.target.value);
        },

        deletePage: function () {
            if (this.model.get('name') == "Homepage" || this.model.get('name') == "Registration Page") {
                new SimpleModalView({
                    text: "The Hompage is an essential part of " + "your application, and can't be deleted."
                });

                return;
            }
            this.askToDelete();
        },

        askToDelete: function () {

            var translateTypetoNL = function (str) {
                if (str == "node") {
                    str = "Widget";
                }

                return str;
            };

            var coll = this.model.collection;
            var model = this.model;

            var widgets = v1State.getWidgetsRelatedToPage(this.model);
            var links = v1State.getNavLinkRelatedToPage(this.model);

            var widgetsNLString = "";
            if (widgets.length) {
                var widgetsNL = _.map(widgets, function (widget) {
                    return translateTypetoNL(widget.widget.get('type')) + ' on ' + widget.pageName;
                });
                widgetsNLString = widgetsNL.join('<br>');

            }

            var linksNLString = "";
            if (links.length) {
                var linksNL = _.map(links, function (link) {
                    return 'Link on ' + link.section + ' of ' + link.pageName;
                });
                linksNLString = linksNL.join('<br>');
            }

            if (!links.length && !widgets.length) {
                coll.remove(model);
            } else {

                new DialogueView({
                    text: "The related widgets listed below will be deleted with this page. Do you want to proceed? <br><br> " + widgetsNLString + linksNLString
                }, function () {

                    coll.remove(model.cid);

                    _.each(widgets, function (widget) {
                        widget.widget.collection.remove(widget.widget);
                    });

                    _.each(links, function (link) {
                        link.link.collection.remove(link.link);
                    });
                });
            }

        },

        clickedEditHeader: function () {
            new HeaderEditorView(this.templateModel);
        },

        expand: function () {
            this.el.className += ' expanded';
            this.el.style.width = "280px";
            this.expanded = true;
        },

        hide: function () {
            this.el.style.width = "";
            this.$el.removeClass('expanded');
            this.expanded = false;
        }
    });

    exports.PageView = PageView;

});

require.define("/pages/HeaderEditorView.js",function(require,module,exports,__dirname,__filename,process,global){    var DialogueView = require('../mixins/DialogueView').DialogueView;
    require('../mixins/BackboneModal');


    var HeaderEditorView = Backbone.ModalView.extend({
        padding: 0,
        width: 600,
        id: 'url-editor',
        //height: 150,
        events: {
            'keyup #header-editor': 'headerContentChanged',
        },

        initialize: function (pageModel) {
            _.bindAll(this);

            this.model = pageModel;
            this.render();
        },

        render: function () {
            console.log(this.model.toJSON());
            var template = '<textarea id="header-editor" style="width:100%; height: 400px;"><%= head %></textarea>';
            this.el.innerHTML = _.template(template, this.model.toJSON());
            this.$editor = this.$el.find('#header-editor');
        },

        headerContentChanged: function () {
            this.model.set('head', this.$editor.val());
        }

    });

    exports.HeaderEditorView = HeaderEditorView;

});

require.define("/template_editor/PageTemplatePicker.js",function(require,module,exports,__dirname,__filename,process,global){        var TemplateGenerator = require('../TemplateGenerator').TemplateGenerator;
        require('../mixins/BackboneModal');

        var page_templates = [];

        var PageTemplatePicker = Backbone.View.extend({
            className: 'page-template-picker',
            width: 700,
            height: 480,
            events: {
                'click .static-template': 'staticSelected',
                'click .info-template': 'infoSelected',
                'click .list-template': 'listSelected'
            },

            initialize: function (options) {
                _.bindAll(this);
                this.model = options.model;
                this.options = options;
                this.render();
            },

            staticSelected: function (e) {
                var tempId = String(e.currentTarget.id).replace('page-', '');
                this.model.get('uielements').add(page_templates[tempId].uielements);

                util.log_to_server("template selected", "static", appId);
                this.closeModal();
            },

            infoSelected: function (e) {
                var tableId = String(e.currentTarget.id).replace('table-info-', '');
                var tableModel = v1State.get('tables').get(tableId);

                if (!this.model.hasContext(tableModel)) {
                    this.model.addToContext(tableModel);
                }

                var appGen = new AppGenerator();
                this.model.get('uielements').add(appGen.generateInfoPage(tableModel), false);

                util.log_to_server("template selected", "info", appId);
                this.closeModal();
            },

            listSelected: function (e) {
                var tableId = String(e.currentTarget.id).replace('table-list-', '');
                var tableModel = v1State.get('tables').get(tableId);

                var appGen = new AppGenerator();
                this.model.get('uielements').add(appGen.generateListPage(tableModel), false);

                util.log_to_server("template selected", "list", appId);
                this.closeModal();
            },

            render: function () {
                var self = this;
                this.el.innerHTML = "<h2>Pick A Template</h2><p>Looks like this page is blank. Would you like to start with one of the templates?</p>";

                var list = document.createElement('ul');
                list.className = 'template-icons';
                _(page_templates).each(function (page, ind) {
                    list.innerHTML += '<li class="page-template static-template" id="page-' + ind + '"><img src="/static/img/page_templates/' + page.icon + '"><span>' + page.name + '</span></li>';
                });

                v1State.get('tables').each(function (tableM) {
                    list.innerHTML += '<li class="page-template info-template" id="table-info-' + tableM.cid + '"><img src="/static/img/page_templates/info-page-icon.png"><span>' + tableM.get('name') + ' Info Page</span></li>';
                    list.innerHTML += '<li class="page-template list-template" id="table-list-' + tableM.cid + '"><img src="/static/img/page_templates/list-page-icon.png"><span>' + tableM.get('name') + ' List Page</span></li>';
                });

                this.el.appendChild(list);
                return this;
            },

            closeModal: function () {
                if (this.options.callback) {
                    this.options.callback.call();
                }
            }
        });

        exports.PageTemplatePicker = PageTemplatePicker;

});

require.define("/TemplateGenerator.js",function(require,module,exports,__dirname,__filename,process,global){var WidgetCollection = require("./collections/WidgetCollection").WidgetCollection;

var AppGenerator = Backbone.View.extend({
    answersDict: {},

    initialize: function (answers) {
        _.bindAll(this);
    },

    generateUsers: function () {
        var usersCollection = new UserRolesCollection();
        if (this.answersDict.multiple_users[0][0] == "yes") {
            _(this.answersDict.types_of_users[0]).each(function (user_role, ind) {
                var user = usersCollection.createUserWithName(user_role);
                user.addFieldsWithNames(this.answersDict.X_user_info[ind]);
            }, this);
        } else {
            var user = usersCollection.createUserWithName("User");
            user.addFieldsWithNames(this.answersDict.user_info[0]);
        }

        return usersCollection;
    },

    generateTables: function () {
        var tablesColl = new TableCollection();
        _(this.answersDict.other_info[0]).each(function (table_name, ind) {
            var table = tablesColl.createTableWithName(table_name);
            table.addFieldsWithNames(this.answersDict.X_info[ind]);
        }, this);

        return tablesColl;
    },

    generatePages: function () {
        var pageColl = new PageCollection();
        pageColl.push(this.generateHomepage());
        pageColl.push(this.generateRegistrationPage());

        return pageColl;
    },

    generateHomepage: function () {
        var homepage = _.clone(HomepageTemp);
        homepage.uielements[0].data.content = appName;
        if (this.answersDict.intro_text) homepage.uielements[1].data.content = this.answersDict.intro_text[0][0];

        if (this.answersDict.logo[0]) {
            homepage.uielements[2].data.content_attribs.src = this.answersDict.logo[0];
        }
        return homepage;
    },

    generateRegistrationPage: function () {

    },

    generateProfilePage: function () {

    },

    generateInfoPage: function (tableM) {
        var arr = [];

        var nmrElements = 0;
        var nmrImageElements = 0;
        var hasImageElements = 0;
        var widgetCollection = new WidgetCollection();
        if (tableM.get('fields').getImageFields()) hasImageElements = 1;
        tableM.getFieldsColl().each(function (fieldModel) {

            var type = fieldModel.get('type');
            if (type == "fk" || type == "m2m" || type == "o2o") {
                return;
            }

            var displayType = util.getDisplayType(type);
            var formFieldModel = {
                field_name: fieldModel.get('name'),
                displayType: "single-line-text",
                type: type,
                label: fieldModel.get('name'),
                placeholder: fieldModel.get('name')
            };

            var layout = {
                left: hasImageElements * 3 + 2,
                top: nmrElements * 3 + 12,
                height: 3,
                width: 5
            };
            var content_ops = {};
            content_ops.content = '{{Page.' + tableM.get('name') + '.' + fieldModel.get('name') + '}}';

            if (displayType == "links") {
                content_ops.content = 'Download ' + fieldModel.get('name');
                content_ops.href = '{{Page.' + tableM.get('name') + '.' + fieldModel.get('name') + '}}';
            }

            if (displayType == "images") {
                layout = {
                    left: 2,
                    top: nmrImageElements * 9 + 12,
                    height: 9,
                    width: 2
                };
                content_ops.src_content = '{{Page.' + tableM.get('name') + '.' + fieldModel.get('name') + '}}';
                nmrImageElements++;
            } else {
                nmrElements++;
            }

            var newElement = widgetCollection.createNodeWithFieldTypeAndContent(layout, displayType, content_ops);
            arr.push(newElement);
        });

        var headerModel = widgetCollection.createNodeWithFieldTypeAndContent({
                left: 3,
                height: 3,
                width: 6,
                top: 3,
                alignment: "center"
            },
            "headerTexts", {
                content: tableM.get('name') + " Info"
            });

        arr.push(headerModel);

        return arr;
    },

    generateListPage: function (tableM) {
        var widgetCollection = new WidgetCollection();
        var headerModel = widgetCollection.createNodeWithFieldTypeAndContent({
                left: 3,
                height: 3,
                width: 6,
                top: 3,
                alignment: "center"
            },
            "headerTexts", {
                content: "List of " + tableM.get('name')
            });
        var listModel = widgetCollection.createList({
            left: 3,
            height: 3,
            width: 6,
            top: 11
        }, tableM);
        var createFormModel = widgetCollection.createCreateForm({
            left: 0,
            height: 3,
            width: 3,
            top: 11,
            l_padding: 15,
            r_padding: 15
        }, tableM);

        var arr = [];
        arr.push(listModel);
        arr.push(headerModel);
        arr.push(createFormModel);

        return arr;
    },

    getJSON: function () {
        return this.state.serialize();
    }

});

exports.AppGenerator = AppGenerator;


/* EXAMPLE */
/*
{
    "category": [
        [
            "social_network"
        ]
    ],
    "multiple_users": [
        [
            "yes"
        ]
    ],
    "types_of_users": [
        [
            "Student",
            "Company"
        ]
    ],
    "X_user_info": [
        [
            "Name",
            "Address"
        ],
        [
            "Name",
            "School"
        ]
    ],
    "other_info": [
        [
            "Offer"
        ]
    ],
    "X_info": [
        [
            "Position",
            "Date"
        ]
    ],
    "logo": [
        []
    ]
}
*/

});

require.define("/template_editor/GuideView.js",function(require,module,exports,__dirname,__filename,process,global){        var GuideView = Backbone.View.extend({
            events: {

            },

            nmrLines: 0,
            horizontalLinesDict: {},
            verticalLinesDict: {},
            show: false,
            positionHorizontalGrid: 80,
            positionVerticalGrid: 15,

            initialize: function (widgetsCollection) {
                _.bindAll(this);

                var self = this;
                this.widgetsCollection = widgetsCollection;
                keyDispatcher.bind(';', this.toggleGuides);

                this.horizontalLinesDict = {};
                this.verticalLinesDict = {};

                this.listenTo(this.widgetsCollection, 'add', this.placeWidget);
                this.listenTo(this.widgetsCollection, 'remove', this.removeWidget);
            },

            render: function () {
                this.widgetsCollection.each(this.placeWidget);
                this.setupDummyLines();
            },

            placeWidget: function (widget) {
                this.placeWidgetLines(widget);
                this.listenTo(widget.get('layout'), 'change', function () {
                    this.changedPosition(widget);
                }, this);
            },

            placeWidgetLines: function (widget) {
                var layout = widget.get('layout');
                var cid = widget.cid;
                this.placeHorizontal(layout.get('top'), cid);
                this.placeHorizontal((layout.get('top') + layout.get('height')), cid);
                this.placeVertical(layout.get('left'), cid);
                this.placeVertical(layout.get('left') + layout.get('width'), cid);
            },

            setupDummyLines: function () {
                for (var ii = 0; ii <= 12; ii++) {
                    this.placeVertical(ii, "dum");
                }
            },

            removeWidget: function (widget) {

                var vKeysToOmit = [];
                _(this.verticalLinesDict).each(function (lineObj, key) {
                    lineObj.models = _.without(lineObj.models, widget.cid);
                    if (!lineObj.models.length) {
                        vKeysToOmit.push(key);
                        $(lineObj.line).remove();
                    }
                });

                this.verticalLinesDict = _.omit(this.verticalLinesDict, vKeysToOmit);

                var hKeysToOmit = [];
                _(this.horizontalLinesDict).each(function (lineObj, key) {
                    lineObj.models = _.without(lineObj.models, widget.cid);
                    if (!lineObj.models.length) {
                        $(lineObj.line).remove();
                        hKeysToOmit.push(key);
                    }
                });

                this.horizontalLinesDict = _.omit(this.horizontalLinesDict, hKeysToOmit);
            },

            changedPosition: function (widget) {

                var vKeysToOmit = [];
                _(this.verticalLinesDict).each(function (lineObj, key) {
                    lineObj.models = _.without(lineObj.models, widget.cid);
                    if (!lineObj.models.length) {
                        vKeysToOmit.push(key);
                        $(lineObj.line).remove();
                    }
                });

                this.verticalLinesDict = _.omit(this.verticalLinesDict, vKeysToOmit);

                var hKeysToOmit = [];
                _(this.horizontalLinesDict).each(function (lineObj, key) {
                    lineObj.models = _.without(lineObj.models, widget.cid);
                    if (!lineObj.models.length) {
                        $(lineObj.line).remove();
                        hKeysToOmit.push(key);
                    }
                });

                this.horizontalLinesDict = _.omit(this.horizontalLinesDict, hKeysToOmit);

                this.placeWidgetLines(widget);
            },

            placeHorizontal: function (nmr, cid) {
                var lineObj = (this.horizontalLinesDict[nmr] || {});

                if (!lineObj.line) {
                    line = document.createElement('div');
                    line.className = 'guide-line-horizontal';
                    line.style.top = (nmr * this.positionVerticalGrid) + 'px';
                    lineObj.line = line;
                    this.$el.append(line);
                }

                lineObj.models = lineObj.models || [];
                lineObj.models.push(cid);

                this.horizontalLinesDict[nmr] = lineObj;
            },

            placeVertical: function (nmr, cid) {
                var lineObj = (this.verticalLinesDict[nmr] || {});

                if (!lineObj.line) {
                    line = document.createElement('div');
                    line.className = 'guide-line-vertical';
                    line.style.left = (nmr * this.positionHorizontalGrid) + 'px';
                    lineObj.line = line;
                    this.$el.append(line);
                }

                lineObj.models = lineObj.models || [];
                lineObj.models.push(cid);

                this.verticalLinesDict[nmr] = lineObj;
            },

            showAll: function () {
                _(this.horizontalLinesDict).each(function (val, key) {
                    $(val.line).addClass('show');
                });

                _(this.verticalLinesDict).each(function (val, key) {
                    $(val.line).addClass('show');
                });
            },

            hideAll: function () {
                _(this.horizontalLinesDict).each(function (val, key) {
                    $(val.line).removeClass('show');
                });

                _(this.verticalLinesDict).each(function (val, key) {
                    $(val.line).removeClass('show');
                });
            },

            toggleGuides: function () {
                if (keyDispatcher.textEditing) return;

                if (this.show) {
                    this.hideAll();
                    this.show = false;
                } else {
                    this.showAll();
                    this.show = true;
                }
            },

            showVertical: function (coor, cid) {
                var coorRounded = Math.round(coor);
                var delta = coorRounded - coor;

                if (this.verticalLinesDict[coorRounded] && !(this.verticalLinesDict[coorRounded].models.length == 1 && this.verticalLinesDict[coorRounded].models[0] == cid)) {
                    $(this.verticalLinesDict[coorRounded].line).addClass('show');
                    if (delta > -0.15 && delta < 0.15 && this.verticalLinesDict[coorRounded].models.length != 1) return coorRounded;
                }
            },

            showHorizontal: function (coor, cid) {
                var coorRounded = Math.round(coor);
                var delta = coorRounded - coor;

                if (this.horizontalLinesDict[coorRounded] && !(this.horizontalLinesDict[coorRounded].models.length == 1 && this.horizontalLinesDict[coorRounded].models[0] == cid)) {
                    $(this.horizontalLinesDict[coorRounded].line).addClass('show');
                    if (delta > -0.5 && delta < 0.5) return coorRounded;
                }


                return null;
            },

            close: function () {
                keyDispatcher.unbind(';', this.toggleGuides);
                Backbone.View.prototype.close.call(this);
            }

        });

        exports.GuideView = GuideView;

});

require.define("/RedoController.js",function(require,module,exports,__dirname,__filename,process,global){var RedoController = Backbone.View.extend({
    redoStack: [],
    undoStack: [],

    initialize: function (data) {
        _.bindAll(this);
        this.startLogging();
    },

    startLogging: function () {
        var uiElements = v1State.getCurrentPage().get('uielements');
        this.bindCollection(uiElements);
    },

    bindCollection: function (coll) {
        this.listenTo(coll, 'add', this.added);
        this.listenTo(coll, 'remove', this.removed);
        this.listenTo(coll, 'change', this.changed);
        coll.each(this.bindModel);
    },

    bindModel: function (model) {
        this.listenTo(model, 'change', this.changed);
        _(model.attributes).each(function (val, key) {

            if (this.isModel(val)) {
                this.bindModel(val);
            } else if (this.isCollection(val)) {
                this.bindCollection(val);
            }

        }, this);
    },

    added: function (model, collection) {
        var changeObj = {
            action: 'added',
            obj: model,
            collection: collection
        };
        this.undoStack.push(changeObj);
    },

    removed: function (model, collection) {
        var changeObj = {
            action: 'removed',
            obj: model,
            collection: collection
        };
        this.undoStack.push(changeObj);
    },

    changed: function (model) {
        var changeObj = {
            action: 'changed',
            prevAttributes: _.clone(model._previousAttributes),
            obj: model
        };
        this.undoStack.push(changeObj);
    },

    isModel: function (obj) {
        if (obj && obj.attributes) return true;
        return false;
    },

    isCollection: function (obj) {
        if (obj && obj.models) return true;
        return false;
    },

    undo: function () {
        var obj = this.undoStack.pop();
        if (!obj) return;
        var reverted_obj = this.pushChange(obj);
        this.redoStack.push(reverted_obj);
    },

    redo: function () {
        var obj = this.redoStack.pop();
        console.log(obj);
        if (!obj) return;
        this.pushChange(obj);
        //this.redoStack.push(obj);
    },

    pushChange: function (obj) {

        var revertedObj = {};

        switch (obj.action) {
        case "added":
            this.stopListening(obj.collection, 'remove', this.removed);
            obj.collection.remove(obj.obj);
            this.listenTo(obj.collection, 'remove', this.removed);

            revertedObj.action = "removed";
            revertedObj.collection = obj.collection;
            revertedObj.obj = obj.obj;
            break;
        case "removed":
            this.stopListening(obj.collection, 'add', this.added);
            obj.collection.add(obj.obj);
            this.listenTo(obj.collection, 'add', this.added);

            revertedObj.action = "added";
            revertedObj.collection = obj.collection;
            revertedObj.obj = obj.obj;
            break;
        case "changed":
            revertedObj.prevAttributes = _.clone(obj.obj.attributes);

            obj.obj.attributes = _.clone(obj.prevAttributes);
            this.stopListening(obj.obj, 'change', this.changed);
            obj.obj.trigger('change');
            if (obj.obj.has('top')) {
                obj.obj.trigger('change:left');
                obj.obj.trigger('change:top');
                obj.obj.trigger('change:width');
                obj.obj.trigger('change:height');
            }
            this.listenTo(obj.obj, 'change', this.changed);

            revertedObj.action = "changed";
            revertedObj.obj = obj.obj;

            break;
        }

        return revertedObj;
    }
});

exports.RedoController = RedoController;

});

require.define("/css-editor/CSSEditorView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var UIElementListView = require('./UIElementListView').UIElementListView;
    var StaticsEditorView = require('./StaticsEditorView').StaticsEditorView;
    var BaseCSSEditorView = require('./BaseCSSEditorView').BaseCSSEditorView;
    var FontEditorView = require('./FontEditorView').FontEditorView;

    var UIElementEditingView = require('./UIElementEditingView').UIElementEditingView;
    var ThemesGalleryView = require('./ThemesGalleryView').ThemesGalleryView;


    var CSSEditorView = Backbone.View.extend({

        elements: [{
                id: "basecss",
                key: "basecss",
                text: "Base CSS"
            }, {
                id: "fonts",
                key: "fonts",
                text: "Fonts"
            }, {
                id: "button",
                key: "buttons",
                text: "Button"
            }, {
                id: "image",
                key: "images",
                text: "Images"
            }, {
                id: "header-text",
                key: "headerTexts",
                text: "Headers"
            }, {
                id: "text",
                key: "texts",
                text: "Texts"
            }, {
                id: "link",
                key: "links",
                text: "Links"
            }, {
                id: "text-input",
                key: "textInputs",
                text: "Text Inputs"
            }, {
                id: "password",
                key: "passwords",
                text: "Password Inputs"
            }, {
                id: "text-area",
                key: "textAreas",
                text: "Text Area"
            }, {
                id: "line",
                key: "lines",
                text: "Lines"
            }, {
                id: "dropdown",
                key: "dropdowns",
                text: "Dropdowns"
            }, {
                id: "box",
                key: "boxes",
                text: "Boxes"
            }, {
                id: "form",
                key: "forms",
                text: "Forms"
            }, {
                id: "list",
                key: "lists",
                text: "Lists"
            }, {
                id: "statics",
                key: "statics",
                text: "Static Files"
            }

        ],

        events: {
            'click #theme-picker-btn': 'openThemePicker',
            'click #navigate-back': 'navBack'
        },


        expanded: false,

        initialize: function () {
            _.bindAll(this);

            this.model = v1UIEState;
            this.lastSave = null;
            this.deepListenTo(this.model, 'change', this.save);

            _.each(this.model.getUIElementCollections(), function (coll) {
                this.listenTo(coll, 'selected', this.styleSelected);
            }, this);

            // TODO: get this back
            var self = this;
            var currentPageInd = v1.currentApp
            v1State.get('templates').each(function (templateModel) {
                var elementsCollection = templateModel.getUIElements();
                // elementsCollection.each(this.bindWidget, this);
                this.listenToModels(elementsCollection, 'selected', function (widgetModel) {
                    self.elementSelected(widgetModel);
                });
            }, this);
            // var elementsCollection = v1State.get().get('uielements');
            // elementsCollection.each(this.bindWidget, this);

            // this.listenTo(elementsCollection, 'add', this.bindWidget);
        },

        bindWidget: function (widgetModel) {
            this.listenTo(widgetModel, 'selected', function () {

            });
        },

        render: function () {
            var self = this;

            /* Top Row */
            var titleEl = document.createElement('div');
            titleEl.className = 'title';
            this.titleDiv = titleEl;
            this.$el.find('.top-row').append(this.titleDiv);

            /* Elements List */
            this.elementsList = document.createElement('ul');
            this.elementsList.innerHTML += '<li id="theme-picker-btn"><a>Pick a Theme</li>';
            _.each(this.elements, function (element) {
                var id = element.id;
                var liEl = document.createElement('li');
                liEl.id = id;

                var aEl = document.createElement('a');
                aEl.innerHTML = element.text;
                liEl.appendChild(aEl);

                this.elementsList.appendChild(liEl);

                $(liEl).bind('click', function () {
                    self.showElementType(id, element.key, element.text);
                });

            }, this);
            this.el.appendChild(this.elementsList);

            this.setTitle("CSS Editor");
            this.$el.find('.navback').hide();

            return this;
        },

        showElementType: function (type, key, text) {

            switch (type) {
            case "basecss":

                var editorView = new BaseCSSEditorView(this.model);
                $(this.elementsList).hide();
                this.setTitle("Base CSS");
                this.expandExtra();
                this.makeResizable();
                this.el.appendChild(editorView.render().el);
                editorView.setupAce();
                this.currentView = editorView;
                this.$el.find('.navback').show();

                break;

            case "fonts":

                var fontEditorView = new FontEditorView(this.model);
                $(this.elementsList).hide();
                this.setTitle("Fonts");
                this.el.appendChild(fontEditorView.render().el);
                this.currentView = fontEditorView;
                this.$el.find('.navback').show();

                break;

            case "statics":

                var staticsEditor = new StaticsEditorView(this.model);
                $(this.elementsList).hide();
                this.setTitle("Static Files");
                this.el.appendChild(staticsEditor.render().el);
                this.currentView = staticsEditor;
                this.$el.find('.navback').show();

                break;

            default:
                var listView = new UIElementListView(this.model.get(key), type);
                $(this.elementsList).hide();
                this.setTitle(text);
                this.el.appendChild(listView.render().el);
                this.currentView = listView;
                this.$el.find('.navback').show();

                break;
            }
        },

        styleSelected: function (styleModel) {
            if (this.currentView) this.currentView.close();
            $(this.elementsList).hide();

            styleModel = styleModel[0];

            this.currentView = new UIElementEditingView({
                model: styleModel
            });
            this.el.appendChild(this.currentView.render().el);

            this.setTitle(styleModel.get('class_name'));
            this.currentView.setupAce();
        },

        elementSelected: function (widgetModel) {

            if (!this.expanded) return;

            var type = widgetModel.get('type');
            if (widgetModel.isList()) {
                type = "lists";
            }
            var className = widgetModel.get('className');
            var styleModel = this.model.getStyleWithClassAndType(className, type);
            this.$el.find('.navback').show();
            //this.styleSelected(styleModel);
        },

        openThemePicker: function () {
            if (this.currentView) this.currentView.close();
            $(this.elementsList).hide();

            this.currentView = new ThemesGalleryView();
            this.el.appendChild(this.currentView.render().el);
            this.setTitle("Theme Picker");
            this.$el.find('.navback').show();
        },

        navBack: function () {
            if (this.currentView) this.currentView.close();
            this.expand();
            this.disableResizable();
            $(this.elementsList).show();
            this.setTitle("CSS Editor");
            this.$el.find('.navback').hide();
        },

        setTitle: function (str) {
            this.titleDiv.innerHTML = str;
        },

        makeResizable: function () {
            var self = this;
            this.$el.resizable({
                handles: "e",
                iframeFix: true,
                start: function (event, ui) {
                    $('#page').css('pointer-events', 'none');
                    self.$el.removeClass('animated');
                },
                stop: function (event, ui) {
                    $('#page').css('pointer-events', 'auto');
                    self.$el.addClass('animated');
                }
            });
        },

        disableResizable: function (argument) {
            if (this.$el.hasClass("ui-resizable")) {
                this.$el.resizable("destroy");
                this.el.style.width = '';
            }
        },

        expandExtra: function (argument) {

            if (!this.$el.hasClass('expanded')) {
                this.el.className += ' expanded';
            }

            if (!this.$el.hasClass('extra')) {
                this.el.className += ' extra';
            }

            this.expanded = true;
        },

        expand: function () {
            if (!this.$el.hasClass('expanded')) {
                this.el.className += ' expanded';
            }

            if (this.$el.hasClass('extra')) {
                this.$el.removeClass('extra');
            }

            this.expanded = true;
        },

        hide: function () {
            this.$el.removeClass('expanded');
            this.disableResizable();
            this.expanded = false;
        },

        save: function () {
            var self = this;
            var json = this.model.serialize();
            var save_url = '/app/' + appId + '/uiestate/';
            // var currentTime = new Date().getTime();

            // if(this.lastSave === null || currentTime - this.lastSave < 3000) {
            //     if(this.timer) clearTimeout(this.timer);
            //     if(this.lastSave === null) {
            //         this.lastSave = currentTime + 1;
            //     }

            //     this.timer = setTimeout(this.save, 3000);
            //     return;
            // }

            // this.lastSave = currentTime;
            $.ajax({
                type: "POST",
                url: save_url,
                data: {
                    uie_state: JSON.stringify(json)
                },
                statusCode: {
                    200: function (data) {
                        console.log('Saved.');
                        self.model.trigger('synced');
                    },
                    500: function () {
                        alert('Server Error');
                    }
                },
                dataType: "JSON"
            });
        }

    });

    exports.CSSEditorView = CSSEditorView;

});

require.define("/css-editor/UIElementListView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var UIElementView = require('./UIElementView').UIElementView;
    var baseTags = {

        "button": [{
            tagName: 'a',
            cons_attribs: {},
            content_attribs: {
                href: "internal://Homepage"
            },
            content: "Default Button",
            isSingle: false
        }],

        "image": [{
            tagName: 'img',
            content_attribs: {
                src: '/static/img/placeholder.png'
            },
            content: null,
            isSingle: true
        }],

        "header-text": [{
            tagName: 'h1',
            content_attribs: null,
            content: 'Default header!',
            isSingle: false
        }],

        "text": [{
            tagName: 'p',
            content_attribs: null,
            content: 'Default text!',
            isSingle: false
        }],

        "link": [{
            tagName: 'a',
            content_attribs: {
                'href': '{{homepage}}'
            },
            content: 'Default Link...',
            isSingle: false
        }],

        "text-input": [{
            tagName: 'input',
            cons_attribs: {
                type: 'text'
            },
            content_attribs: {
                placeholder: 'Default placeholder...'
            },
            content: null,
            isSingle: true
        }],

        "password": [{
            tagName: 'input',
            tagType: 'password',
            content_attribs: {
                placeholder: 'Default placeholder...'
            },
            content: null,
            isSingle: true
        }],

        "text-area": [{
            tagName: 'textarea',
            content_attribs: null,
            content: 'Default Text Area...',
            isSingle: false
        }],

        "line": [{
            tagName: 'hr',
            cons_attribs: {},
            content: null,
            isSingle: true
        }],

        "dropdown": [{
            tagName: 'select',
            content: '<option>Option 1</option>',
            attribs: null,
            isSingle: false
        }],

        "box": [{
            tagName: 'div',
            content: null,
            cons_attribs: {
                style: 'border:1px solid #333;'
            },
            isSingle: false
        }],

        "form": [{
            tagName: 'form',
            content: null,
            cons_attribs: {},
            isSingle: false
        }],

        "list": [{
            tagName: 'div',
            content: null,
            cons_attribs: {},
            isSingle: false
        }]
    };

    var UIElementListView = Backbone.View.extend({

        className: 'elements list',
        events: {
            'click div.create-text': 'showForm',
            'submit .element-create-form': 'submitForm'
        },

        initialize: function (UIElementColl, type) {
            _.bindAll(this);
            this.type = type;
            this.collection = UIElementColl;
            this.collection.bind('add', this.appendUIE);
            this.collection.bind('remove', this.removeUIE);
        },

        render: function () {
            var self = this;
            var div = document.createElement('span');
            div.className = 'elems';
            this.elems = div;
            this.el.appendChild(this.elems);

            this.collection.each(function (uieModel) {
                uieModel.id = self.collection.length;
                self.appendUIE(uieModel);
            });

            var createBtn = document.createElement('span');
            var temp = [
                '<div class="create-text">',
                '<img src="/static/img/add.png" class="span2 add-img">',
                '<h3 class="offset1">Create an element</span>',
                '</div>',
            ].join('\n');
            createBtn.innerHTML = _.template(temp, {});

            this.el.appendChild(createBtn);
            return this;
        },


        showForm: function (e) {
            var root = {};
            if (baseTags[this.type]) {
                root = baseTags[this.type][0];
            }
            this.collection.push(root);
        },

        submitForm: function (e) {
            //alert("HEEEEY");
        },

        appendUIE: function (uieModel) {
            var newView = new UIElementView(uieModel);
            this.elems.appendChild(newView.render().el);
        },

        removeUIE: function (uieModel) {
            $('#' + uieModel.cid).remove();
        }

    });

    exports.UIElementListView = UIElementListView;

});

require.define("/css-editor/UIElementView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var UIElementEditingView = require('./UIElementEditingView');

    var UIElementView = Backbone.View.extend({
        el: null,
        className: 'widgetWrapper widget-style-wrapper',
        isExpanded: false,

        events: {
            'click': 'toggleElement',
            'click .remove': 'removeUIE',
            'keyup .class_name': 'classNameChaged'
        },

        initialize: function (uieModel) {
            _.bindAll(this);

            this.model = uieModel;
            this.model.bind('change', this.reRender);
            this.model.bind('change', this.reRenderStyleTags);

            this.renderStyle();
        },

        render: function () {
            this.el.id = 'elem-' + this.model.cid;

            var upperDiv = document.createElement('div');
            upperDiv.className = "upper-area row";
            var class_name = this.model.get('class_name');
            upperDiv.innerHTML = [
                '<div class="hoff1">',
                '<input type="text" name="className" placeHolder="Class Name" class="class_name" value="' + class_name + '" placeholder="className...">',
                '<div class="edit-text btn">Edit Style</div>',
                '<span class="btn remove hoff1">Remove Style</span>',
                '</div>'
            ].join('\n');

            this.tempNodeDiv = document.createElement('div');
            this.tempNodeDiv.className = "temp-node-area hoff1";
            this.tempNodeDiv.innerHTML = _.template(this.tempNode(), {
                info: this.model.attributes
            });

            upperDiv.appendChild(this.tempNodeDiv);
            this.el.appendChild(upperDiv);
            return this;
        },

        reRender: function (argument) {
            this.tempNodeDiv.innerHTML = _.template(this.tempNode(), {
                info: this.model.attributes
            });
        },

        reRenderStyleTags: function (e) {
            var styleTag = document.getElementById(this.model.cid + '-' + 'style');
            styleTag.innerHTML = '#' + this.model.get('class_name') + '{' + this.model.get('style') + '}';
            var hoverTag = document.getElementById(this.model.cid + '-' + 'hover-style');
            hoverTag.innerHTML = '#' + this.model.get('class_name') + ':hover {' + this.model.get('hoverStyle') + '}';
            var activeTag = document.getElementById(this.model.cid + '-' + 'active-style');
            activeTag.innerHTML = '#' + this.model.get('class_name') + ':active {' + this.model.get('activeStyle') + '}';
        },

        renderStyle: function () {

            var styleTag = document.createElement('style');
            styleTag.id = this.model.cid + '-' + 'style';
            styleTag.innerHTML = '#' + this.model.get('class_name') + '{' + this.model.get('style') + '}';

            var hoverStyleTag = document.createElement('style');
            hoverStyleTag.id = this.model.cid + '-' + 'hover-style';
            hoverStyleTag.innerHTML = '#' + this.model.get('class_name') + ':hover {' + this.model.get('hoverStyle') + '}';

            var activeStyleTag = document.createElement('style');
            activeStyleTag.id = this.model.cid + '-' + 'active-style';
            activeStyleTag.innerHTML = '#' + this.model.get('class_name') + ':active {' + this.model.get('activeStyle') + '}';

            document.head.appendChild(styleTag);
            document.head.appendChild(hoverStyleTag);
            document.head.appendChild(activeStyleTag);
        },

        removeUIE: function (e) {
            e.preventDefault();
            e.stopPropagation();
            var model = this.model;
            this.model.collection.remove(model.cid);
            $(this.el).remove();
        },

        baseChanged: function () {

        },

        toggleElement: function (e) {
            if (e.target.tagName == "INPUT") return;
            if (e.target.className.indexOf('ace_') === 0) return;
            console.log(e.target);

            var btn = this.$el.find('.edit-text').first();
            if (!this.isExpanded) {
                this.expandElement();
                btn.html('Close Edit Panel');
            } else {
                this.shrinkElement();
                btn.html('Expand Edit Panel');
            }
        },

        expandElement: function () {
            // this.isExpanded = true;
            // this.expandedView = new UIElementEditingView(this.model);
            // this.el.appendChild(this.expandedView.render().el);
            // this.expandedView.setUpAce();
            // this.el.style.height = 'auto';
            console.log(this.model);
            this.model.collection.trigger('selected', [this.model]);
        },

        shrinkElement: function () {
            this.expandedView.close();
            this.isExpanded = false;
            this.el.style.height = '225px';
        },

        classNameChaged: function (e) {
            this.model.set('class_name', e.target.value);
        },

        tempNode: function () {
            return [
                '<div class="element-node">',
                '<<%= info.tagName %> ',
                'id="<%= info.class_name %>" ',
                '<% _(info.cons_attribs).each(function(val, key){ %>',
                '<%= key %> = <%= val %>',
                '<% }); %><% _(info.content_attribs).each(function(val, key){ %>',
                '<%= key %> = <%= val %>',
                '<% }); %>>',
                '<% if(!info.isSingle) { %>',
                '<%= info.content %></<%=info.tagName%>>',
                '<% } %>',
                '</div>'
            ].join('\n');
        }

    });

    exports.UIElementView = UIElementView;

});

require.define("/css-editor/UIElementEditingView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    require('../mixins/BackboneModal');

    var UIElementEditingView = Backbone.View.extend({

        tagName: 'div',
        className: 'element-view',

        events: {
            'click .delete-elem': 'deleteElement'
        },

        initialize: function (options) {
            _.bindAll(this);

            this.model = options.model;
            console.log(this.model);
            this.model.bind('change:style', this.renderStyleTags);
            this.model.bind('change:hoverStyle', this.renderStyleTags);
            this.model.bind('change:activeStyle', this.renderStyleTags);
        },

        render: function () {
            var tempPane = [
                '<div class="sect"><h4>Normal State</h4><div id="style-<%= cid %>" class="style style-editor" placeholder="Styling here..."></div></div>',
                '<div class="sect"><h4>Hover State</h4><div id="hover-style-<%= cid %>" class="hover-style style-editor"></div></div>',
                '<div class="sect"><h4>Active State</h4><div id="active-style-<%= cid %>" class="active-style style-editor"></div></div>'
            ].join('\n');

            var form = _.template(tempPane, {
                info: this.model.attributes,
                cid: this.model.cid
            });

            console.log(form);
            this.el.innerHTML = form;
            return this;
        },

        setupAce: function () {
            console.log(this.el);
            console.log($("#style-" + this.model.cid));
            var self = this;

            console.trace();
            setTimeout(function () {

                var cid = self.model.cid;
                console.log(cid);
                console.log(self.model.get('style'));
                console.log(self.model);

                self.styleEditor = ace.edit("style-" + cid);
                self.styleEditor.getSession().setMode("ace/mode/css");
                self.styleEditor.setValue(self.model.get('style'), -1);
                self.styleEditor.getSession().on('change', self.styleChanged);

                self.hoverStyleEditor = ace.edit("hover-style-" + cid);
                self.hoverStyleEditor.getSession().setMode("ace/mode/css");
                self.hoverStyleEditor.setValue(self.model.get('hoverStyle'), -1);
                self.hoverStyleEditor.getSession().on('change', self.hoverStyleChanged);

                self.activeStyleEditor = ace.edit("active-style-" + cid);
                self.activeStyleEditor.getSession().setMode("ace/mode/css");
                self.activeStyleEditor.setValue(self.model.get('activeStyle'), -1);
                self.activeStyleEditor.getSession().on('change', self.activeStyleChanged);

            });

        },

        deleteElement: function () {
            var self = this;
            this.model.collection.remove(self.model.cid);
            this.closeModal();
        },

        styleChanged: function (e) {
            var value = this.styleEditor.getValue();
            this.model.set('style', value);
        },

        hoverStyleChanged: function (e) {
            var value = this.hoverStyleEditor.getValue();
            console.log(value);
            console.log("YOLO");
            console.log(this.model);
            this.model.set('hoverStyle', value);
        },

        activeStyleChanged: function (e) {
            var value = this.activeStyleEditor.getValue();
            this.model.set('activeStyle', value);
        }

    });

    exports.UIElementEditingView = UIElementEditingView;

});

require.define("/css-editor/StaticsEditorView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var StaticsEditorView = Backbone.View.extend({

        className: 'elements statics',
        events: {
            'click #upload-static': 'uploadStatic',
            'click .static-file': 'clickedStatic'
        },

        initialize: function (themeModel) {
            _.bindAll(this);
            this.model = themeModel;
        },

        render: function () {

            var temp = [
                '<div id="theme-statics" class="row"></div>',
                '<div class="btn-info btn" id="upload-static">Upload New</div>'
            ].join('\n');

            this.el.innerHTML = temp;
            this.staticsList = this.$el.find('#theme-statics');
            _(statics).each(this.appendStaticFile, this);

            return this;
        },

        uploadStatic: function () {
            var self = this;
            util.filepicker.openFilePick(this.staticsAdded, this, appId);
        },

        appendStaticFile: function (file) {
            this.staticsList.append('<div id="themestatic-' + file.id + '" class="static-file"><img src="' + file.url + '"><p class="name">' + file.name + '</p><a href="#' + file.id + '" class="btn btn-danger remove">Delete</a></div>');
        },

        deleteStaticFile: function (e) {
            var self = this;
            var imgNode = e.target.parentNode;
            var id = parseInt(imgNode.id.replace('themestatic-', ''), 10);
            $.ajax({
                type: 'POST',
                url: url + '/static/' + id + '/delete/',
                success: function () {
                    console.log('successfully deleted!');
                    util.get('theme-statics').removeChild(imgNode);
                },
                error: function (jqxhr, textStatus) {
                    message = "Error deleting file";
                    if (textStatus) {
                        message += ': ' + textStatus;
                    }
                    new ErrorDialogueView({
                        text: message
                    });
                }
            });
            return false;
        },


        staticsAdded: function (files, self) {
            _(files).each(function (file) {
                file.name = file.filename;
                self.appendStaticFile(file);
            });
        },

        clickedStatic: function (e) {
            var $el = $(e.currentTarget).find('img');
            link = $el.attr('src');
            util.copyToClipboard(link);
        }

    });

    exports.StaticsEditorView = StaticsEditorView;

});

require.define("/css-editor/BaseCSSEditorView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var BaseCSSEditorView = Backbone.View.extend({

        className: 'elements basecss',
        events: {},

        doneTypingInterval: 3000,

        initialize: function (themeModel) {
            _.bindAll(this);
            this.model = themeModel;
            this.typingTimer = null;
        },

        render: function () {
            var temp = [
                '<div class="base-css" id="base-css" style="height:100%; width:100%;">'
            ].join('\n');
            this.el.innerHTML = temp;
            return this;
        },

        setupAce: function () {
            this.editor = ace.edit("base-css");
            this.editor.getSession().setMode("ace/mode/css");
            this.editor.setValue(this.model.get('basecss'), -1);
            this.editor.on("change", this.keyup);
        },

        keyup: function (e) {
            if (this.typingTimer) clearTimeout(this.typingTimer);
            this.typingTimer = setTimeout(this.baseChanged, this.doneTypingInterval);
        },

        baseChanged: function (e) {
            var currentCSS = this.editor.getValue();
            this.model.set('basecss', currentCSS);
        }

    });

    exports.BaseCSSEditorView = BaseCSSEditorView;

});

require.define("/css-editor/FontEditorView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var FontEditorView = Backbone.View.extend({

        className: 'elements fonts',
        events: {},

        initialize: function (themeModel) {
            _.bindAll(this);
            this.model = themeModel;
        },

        render: function () {
            var temp = [
                '<input type="text" class="font-selector">',
                '<ul class="fonts hoff2"></ul>',
            ].join('\n');

            this.el.innerHTML = temp;


            var tempFont = [
                '<li class="row">',
                '<span class="remove" data-cid="<%= cid %>">×</span>',
                '<span class="font" style="font-family:<%= font %>"><%= font %></span>',
                '</li>'
            ].join('\n');

            var self = this;
            var fontStyles = document.createElement('style');
            fontStyles.type = "text/css";

            // add font to page style, and to font list
            this.model.get('fonts').each(function (font) {

                fontStyles.innerHTML += '@import url("http://fonts.googleapis.com/css?family=' + font.get('name') + ':400,700,900,400italic");\n';
                this.$el.find('.fonts').append(_.template(tempFont, {
                    font: font.get('name').replace(/\+/g, ' '),
                    cid: font.cid
                }));

            }, this);
            document.body.appendChild(fontStyles);

            console.log($('.font-selector'));
            // setup font event handlers
            this.$el.find('.font-selector').fontselect().change(function () {
                var value = $(this).val();

                if (self.model.get('fonts').where({
                    name: value
                }).length > 0) {
                    return false;
                }
                var newFont = self.model.get('fonts').add({
                    name: value
                });

                var font = value.replace(/\+/g, ' ');
                self.$el.find('.fonts').append(_.template(tempFont, {
                    font: font,
                    cid: newFont.cid
                }));

            });

            this.$el.find('.fonts').on('click', 'li .remove', function (e) {
                var cid = e.currentTarget.dataset.cid;
                self.model.get('fonts').remove(cid);
                console.log(self.model.get('fonts').serialize());
                $(e.currentTarget).parent().remove();
            });

            return this;
        },

        baseChanged: function (e) {
            var currentCSS = this.editor.getValue();
            this.model.set('basecss', currentCSS);
        }

    });

    exports.FontEditorView = FontEditorView;

});

require.define("/css-editor/ThemesGalleryView.js",function(require,module,exports,__dirname,__filename,process,global){'use strict';

var ThemeDisplayView = require('./ThemeDisplayView');

var ThemesGalleryView = Backbone.View.extend({
    css: 'gallery',
    events: {
        'mouseover  .theme': 'previewTheme',
        'mouseleave .theme': 'revertTheme',
        'click .load-theme-btn': 'loadTheme'
    },

    className: 'gallery-view',
    currentPreview: 0,

    initialize: function () {
        this.title = "Themes";
    },

    render: function () {
        this.listView = document.createElement('ul');
        this.listView.className = 'theme-gallery';

        var template = [
            '<li class="theme" class="theme-item" id="theme-<%= id %>">',
            '<h2><%= name %></h2>',
            '<p class="designed-by">Designed by <%= designer %></p>',
            '<div class="img"><img src="<%= image %>"><div class="details" id="theme-prev-<%= id %>">Previewing</div></div>',
            '<div id="theme-btn-<%= id %>" class="btn load-theme-btn">Load Theme</div>',
            '</li>'
        ].join('\n');

        _(themes).each(function (theme, index) {
            if (!theme.name) {
                theme.name = "Theme " + index;
            }
            this.listView.innerHTML += _.template(template, theme);
        }, this);

        $(this.el).append(this.listView);

        return this;
    },

    previewTheme: function (e) {
        var themeId = String(e.currentTarget.id).replace('theme-', '');

        if (this.currentPreview == themeId) return;
        $('.details.active').removeClass('active');
        var url = "/theme/" + themeId + '/sheet.css';
        this.currentPreview = themeId;
        v1.view.iframeProxy.addTempStyleSheet(url, function () {
            $('#theme-prev-' + themeId).addClass('active');
        });
    },

    revertTheme: function () {
        var self = this;
        this.currentPreview = null;
        setTimeout(function () {
            if (self.currentPreview === null) {
                v1.view.iframeProxy.removeTempStyleSheet();
            }
        }, 200);
    },

    loadTheme: function (e) {
        $('.load-theme-btn').html("Load Theme");
        var themeId = e.currentTarget.id.replace('theme-btn-', '');
        e.currentTarget.innerHTML = "Loading";
        e.currentTarget.appendChild(util.threeDots().el);

        $.ajax({
            type: "POST",
            url: '/theme/' + themeId + '/info/',
            success: function (data) {
                var info = data.themeInfo;
                var url = '/app/' + appId + '/uiestate/';
                var newState = uieState;
                newState = _.extend(uieState, this.theme);

                var self = this;
                $.ajax({
                    type: "POST",
                    url: url,
                    data: {
                        uie_state: JSON.stringify(newState)
                    },
                    success: function (data) {
                        e.currentTarget.innerHTML = "Loaded!";
                        //self.$el.find('.load').append('<div class="hoff1"><h4 class="text-success"><strong>Loaded!</strong></h4></div>');
                    }
                });

                /* Load Statics */
                $.ajax({
                    type: "GET",
                    url: '/theme/' + info.id + '/static/',
                    success: function (data) {
                        _(data).each(function (static_file) {
                            $.ajax({
                                type: "POST",
                                url: '/app/' + appId + '/static/',
                                data: JSON.stringify(static_file),
                                success: function (data) {}
                            });
                        });
                    }
                });
            },
            dataType: "JSON"
        });


    }

});

exports.ThemesGalleryView = ThemesGalleryView;

});

require.define("/css-editor/ThemeDisplayView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    require('../mixins/BackboneModal');

    var ThemeDisplayView = Backbone.ModalView.extend({
            el: null,
            events: {
                'click #load-btn': 'loadTheme'
            },
            theme: null,

            initialize: function (data) {
                _.bindAll(this);

                this.info = data.themeInfo;
                this.theme = data.theme;
                this.render();
            },

            render: function () {
                var template = ['<h2 class="span30"><%= name %></h2>',
                    '<p class="designed-by hoff1">Designed by <%= designer %></p>',
                    '<div class="span12"><img src="<%= image %>"></div>',
                    '<div class="span10 offset2 load"><div class="btn" id="load-btn">Load Theme</div></div>'
                ].join('\n');
                this.el.innerHTML = _.template(template, this.info);
            },

            loadTheme: function () {
                var url = '/app/' + appId + '/uiestate/';
                var newState = uieState;
                if (this.info.web_or_mobile == "M") {
                    url = '/app/' + appId + '/mobile_uiestate/';
                    newState = _.extend(mobileUieState, this.theme);
                } else {
                    newState = _.extend(uieState, this.theme);
                }

                var self = this;
                $.ajax({
                    type: "POST",
                    url: url,
                    data: {
                        uie_state: JSON.stringify(newState)
                    },
                    success: function (data) {
                        self.$el.find('.load').append('<div class="hoff1"><h4 class="text-success"><strong>Loaded!</strong></h4></div>');
                        setTimeout(function () {
                            self.closeModal();
                        }, 800);
                    }
                });

                this.switchToV2();
                /* Load Statics */
                $.ajax({
                    type: "GET",
                    url: '/theme/' + self.info.id + '/static/',
                    success: function (data) {
                        _(data).each(function (static_file) {
                            $.ajax({
                                type: "POST",
                                url: '/app/' + appId + '/static/',
                                data: JSON.stringify(static_file),
                                success: function (data) {}
                            });
                        });
                    }
                });
            },

            switchToV2: function () {
                v1State.get('pages').each(function (pageM) {
                    pageM.get('navbar').set('version', 2);
                    pageM.get('footer').set('version', 2);
                });

                v1.save();
            }
        }

    );

    exports.ThemeDisplayView = ThemeDisplayView;

});

require.define("/template_editor/SectionShadowView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var SectionShadowView = Backbone.View.extend({

        widgetsContainer: null,

        events: {
            'mouseover': 'hovered',
            'mouseup': 'hovered',
            'mouseover .ycol': 'hoveredColumn',
            'mouseup .ycol': 'hoveredColumn'
        },

        className: "section-shadow-view",

        subviews: [],

        initialize: function (sectionCollection) {
            _.bindAll(this);

            this.collection = sectionCollection;
            // this.listenToModels(sectionCollection, 'change', this.reRenderSectionShadow);
            this.listenTo(this.collection, 'add', this.renderSectionShadow);
            this.listenTo(this.collection, 'remove', this.removeSectionShadow);
        },

        render: function () {

            this.shadowFrame = document.getElementById('shadow-frame');
            var iframe = v1.currentApp.view.iframe;
            this.iframe = iframe;
            this.iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

            this.shadows = [];
            this.collection.each(this.renderSectionShadow);
            $(this.shadowFrame).hide();

            return this;
        },

        renderSectionShadow: function (sectionModel) {

            var $el = $(this.iframeDoc).find('[data-cid="' + sectionModel.cid + '"]');
            var ycols = $el.find('[data-column]');

            var self = this;

            /* Overall DOM el */
            // var overallShadowEl = util.addShadow($el[0], document.getElementById('page-wrapper'), self.iframe, self.iframeDoc);
            // self.shadowFrame.appendChild(overallShadowEl);
            // overallShadowEl.style.backgroundColor = "red";
            // overallShadowEl.className = "section-shodow-wrapper";

            /* DOM el for each column */
            ycols.each(function () {
                var colCid = this.dataset.cid;
                var shadowEl = util.addShadow(this, document.getElementById('page-wrapper'), self.iframe, self.iframeDoc);
                shadowEl.className = "section-shadow";
                self.shadows.push(shadowEl);
                self.shadowFrame.appendChild(shadowEl);

                $(shadowEl).droppable({
                    accept: ".ui-draggable",
                    drop: function (event, ui) {

                        var extraData = {};

                        var type = $(ui.draggable).data("type");

                        // try {
                        if ($(ui.draggable).data("extraData")) {
                            extraData = $(ui.draggable).data("extraData");
                        }

                        if ($(ui.draggable).data("genpath")) {
                            sectionModel.get('columns').get(colCid).addElementWithPath(type, $(ui.draggable).data("genpath"), extraData);
                            return;
                        }

                        sectionModel.get('columns').get(colCid).addElement(type, extraData);

                        // }
                        // catch(e) {
                        //     console.log(e);
                        //     console.log("Error with new element: "+ JSON.stringify(e));
                        //     self.hideColumnShadows();

                        // }
                    },
                    over: function () {
                        shadowEl.className = "section-shadow active";
                    },
                    out: function () {
                        shadowEl.className = "section-shadow";
                    }
                });


            });

        },

        reRenderSectionShadow: function () {
            _.each(this.shadows, function (el) {
                $(el).remove();
            });
            this.shadows = [];
            this.render();
        },

        removeSectionShadow: function (sectionModel) {
            // TODO: Fix this
        },

        displayColumnShadows: function () {
            this.reRenderSectionShadow();
            $(this.shadowFrame).show();
            _.each(this.shadows, function (shadowEl) {
                $(shadowEl).show();
            });
        },

        hideColumnShadows: function () {
            $(this.shadowFrame).hide();
            _.each(this.shadows, function (shadowEl) {
                $(shadowEl).hide();
            });
        }

    });

    exports.SectionShadowView = SectionShadowView;

});

require.define("/template_editor/SectionEditorsView.js",function(require,module,exports,__dirname,__filename,process,global){'use strict';
var SectionEditorView = require('./SectionEditorView').SectionEditorView;

var SectionEditorsView = Backbone.View.extend({

    el: document.body,

    widgetsContainer: null,

    events: {
        'click #addNewSectionTitle': 'showSectionOptions',
        'click .section-option': 'selectSectionLayout'
    },

    optionsHidden: true,

    subviews: [],

    initialize: function (sectionsCollection) {
        _.bindAll(this);

        var self = this;
        this.subviews = [];

        this.sectionsCollection = sectionsCollection;
        this.listenTo(this.sectionsCollection, 'add', this.placeNewSectionEditor);
        this.editorViews = [];
    },

    render: function () {
        this.pageWrapper = document.getElementById('page-wrapper');
        var iframe = v1.currentApp.view.iframe;
        this.iframe = iframe;
        this.iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

        this.sectionsCollection.each(this.placeNewSectionEditor);
    },

    placeNewSectionEditor: function (sectionModel) {
        var sectionEditorView = new SectionEditorView(sectionModel).render();
        this.pageWrapper.appendChild(sectionEditorView.el);

        this.editorViews.push(sectionEditorView);

    }
});

exports.SectionEditorsView = SectionEditorsView;

});

require.define("/template_editor/SectionEditorView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var WidgetSettingsView = require('./WidgetSettingsView');

    var SectionEditorView = Backbone.View.extend({

        events: {
            'keyup .class_name': 'classNameChaged',
            'click .remove-section': 'removeSection',
            'click .settings': 'openSettingsView',
            'click .section-up': 'moveSectionUp',
            'click .section-down': 'moveSectionDown',
            'click .dropdown-toggle': 'toggleDropdown',
            'mouseover': 'menuHovered',
            'mouseout': 'menuUnhovered'
        },

        className: "section-editor-view",
        isActive: true,

        initialize: function (sectionModel) {
            _.bindAll(this);
            this.model = sectionModel;
            this.listenTo(this.model, 'hovered', this.hovered);
            this.listenTo(this.model, 'unhovered', this.unhovered);
            this.listenTo(this.model, 'remove', this.close);
        },

        render: function () {
            var template = [
                '<div class="btn-group">',
                '<div class="section-editor-button">',
                '<div class="dropdown-toggle"><img width="24" class="icon" src="' + STATIC_URL + 'img/edit.png"></div>',
                '<div class="section-up move">▲</div>',
                '<div class="section-down move">▼</div>',
                '</div>',
                '<ul class="section-editor-menu animated">',
                '<div class="top-arrow arw"></div>',

                '<li><a><input type="text" class="class_name" value="<%= className %>" placeholder="Class Name"></a></li>',
                '<li><span class="option-button delete-button tt remove-section"></span><div class="option-button settings"></div></li>',
                // '<li class="remove-section"><a>Remove Section</a></li>',
                '</ul>',
                '</div>'
            ].join('');

            var data = this.model.toJSON();
            data.className = data.className || "";

            this.el.innerHTML = _.template(template, data);
            this.$menu = this.$el.find('.section-editor-menu');
            // this.$el.find('.dropdown-menu input').click(function(event){
            //     event.stopPropagation();
            // });

            this.pageWrapper = document.getElementById('page-wrapper');
            var iframe = v1.currentApp.view.iframe;
            this.iframe = iframe;
            this.iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            this.$sectionEl = $(this.iframeDoc).find('[data-cid="' + this.model.cid + '"]');

            this.setPosition();

            this.renderShadow();
            this.positionShadow();

            return this;
        },

        renderShadow: function () {

            this.shadowEl = util.addShadow(this.$sectionEl[0], document.getElementById('page-wrapper'), this.iframe, this.iframeDoc);
            this.shadowEl.className = "section-shadow";
            this.pageWrapper.appendChild(this.shadowEl);
            this.$shadowView = $(this.shadowEl);

        },

        positionShadow: function () {
            this.$sectionEl = $(this.iframeDoc).find('[data-cid="' + this.model.cid + '"]');
            var positionRightTop = util.getRightTop(this.$sectionEl[0], document.getElementById('page-wrapper'), this.iframe, this.iframeDoc);
            this.shadowEl.style.top = (positionRightTop.top) + "px";
            this.shadowEl.style.height = this.$sectionEl.outerHeight() + 'px';
        },

        toggleDropdown: function () {
            if (this.expanded) {
                this.$menu.hide();
                this.expanded = false;
            } else {
                this.$menu.addClass('fadeInUp');
                this.$menu.show();
                this.$el.find('.class_name').focus();
                this.expanded = true;
            }
        },

        setPosition: function () {
            var $el = $(this.iframeDoc).find('[data-cid="' + this.model.cid + '"]');
            var el = $el[0];

            var positionRightTop = util.getRightTop(el, document.getElementById('page-wrapper'), this.iframe, this.iframeDoc);
            this.el.style.left = (positionRightTop.right - 120) + 'px';
            this.el.style.top = (positionRightTop.top + 15) + 'px';
        },

        classNameChaged: function (e) {
            var value = e.currentTarget.value;
            this.model.set('className', value);
        },

        openSettingsView: function () {
            new WidgetSettingsView(this.model).render();
            this.isActive = true;
        },

        moveSectionUp: function () {
            var fromInd = _.indexOf(this.model.collection.models, this.model);
            var toInd = fromInd - 1;
            if (fromInd == 0) return;
            this.model.collection.arrangeSections(fromInd, toInd);
            this.setPosition();
            this.positionShadow();
        },

        moveSectionDown: function () {
            var fromInd = _.indexOf(this.model.collection.models, this.model);
            var toInd = fromInd + 1;
            if (this.model.collection.models.length == toInd) return;
            this.model.collection.arrangeSections(fromInd, toInd);
            this.setPosition();
            this.positionShadow();
        },

        removeSection: function () {
            this.model.collection.remove(this.model);
        },

        menuHovered: function () {
            this.positionShadow();
            this.$shadowView.show();
            this.isActive = true;
        },

        menuUnhovered: function () {
            this.isActive = false;
            var self = this;
            var timer = setTimeout(function () {
                console.log(self.isActive);
                if (!self.isActive) {
                    self.$shadowView.hide();
                }

                clearTimeout(timer);
            }, 600);
        },

        hovered: function () {
            this.setPosition();
            this.$el.show();
        },

        unhovered: function () {
            this.$el.hide();
            this.$menu.hide();
            this.expanded = false;
        },

        close: function () {
            this.$shadowView.remove();
            SectionEditorView.__super__.close.call(this);
        }

    });

    exports.SectionEditorView = SectionEditorView;

});

require.define("/template_editor/editor-templates.js",function(require,module,exports,__dirname,__filename,process,global){var Templates = {};

Templates.tempMeta = [
    '<ul class="meta" style="display:none;">',
    '<li><img class="delete" src="/static/img/delete-icon.png"></li>',
    '<li><img class="delete" src="/static/img/delete-icon.png"></li>',
    '</ul>'
].join('\n');


Templates.tempNode = [
    '<<%= element.tagName %> ',
    'class = "<%= element.class_name %>" ',
    '<% _(element.cons_attribs).each(function(val, key) { %>',
    '<%=key%>="<%=val%>"<% }); %> ',
    '<% _(element.content_attribs).each(function(val, key) { %>',
    '<%=key%>="<%=val%>"<% }); %>> ',
    '<% if(!element.isSingle) { %>',
    '<%= element.content %>',
    '</<%= element.tagName %>>',
    '<% }; %>'
].join('');

Templates.NavbarEditor = [
    '<div>',
    '<div class="clone">Click here to clone navigation bar from another page.</div>',
    '<div class="hoff1">',
    '<h4 class="offset1">Main Title</h4><input type="text" name="edit-brandName" class="span16" style="float:none;" id="edit-brandname" value="<%= brandName %>">',
    '</div>',
    '<hr>',
    '<h4 class="offset1">Links</h4>',
    '<div class="links-list hoff1">',
    '<ul id="link-editors"></ul>',
    '<div class="well well-small add-link">',
    'Add Link',
    '</div>',
    '</div>',
    '</div>'
].join('\n');

Templates.FooterEditor = [
    '<div>',
    '<div class="clone">Click here to clone footer from another page.</div>',
    '<div class="hoff1">',
    '<h4 class="offset1">Custom Footer Text</h4><input type="text" name="edit-customText" class="span16" style="float:none;" id="edit-customText" value="<%= customText %>">',
    '</div>',
    '<hr>',
    '<h4 class="offset1">Links</h4>',
    '<div class="links-list hoff1">',
    '<ul id="link-editors"></ul>',
    '<div class="well well-small add-link">',
    'Add Link',
    '</div>',
    '</div>',
    '</div>'
].join('\n');

Templates.LinkEditor = [
    '<div class="row">',
    '<div class="span12">',
    '<label>Link title</label>',
    '<input class="link-title" type="text" value="<%= title %>"">',
    '</div>',
    '<div class="span20">',
    '<div class="select-container">',
    '<label>Location</label>',
    '<select class="link-options"></select>',
    '</div>',
    '<div class="url-container" style="display: none">',
    '<label>Url</label>',
    '<input type="url" class="url" id="url" value="<%= url %>">',
    '</div>',
    '</div>',
    '<a class="remove" style="float:right" href="#">Delete Link</a>',
    '</div>'
].join('\n');


Templates.tempLi = [
    '<li id="entity-user-<%= attr %>" class="large single-data">',
    '<span class="name">Show <%= name %> <%= attr %></span></li>'
].join('\n');

Templates.tempLiSingleData = [
    '<li id="entity-<%= cid %>-<%= attr %>" class="large single-data">',
    '<span class="name">Show <%= name %> <%= attr %></span></li>'
].join('\n');

Templates.tempLiEntity = [
    '<li id="entity-<%= cid %>" class="show entity">',
    '<span class="name">List of <%= name %></span></li>'
].join('\n');

Templates.tempLiTable = [
    '<li id="entity-<%= cid %>" class="table-gal entity">',
    '<span class="name"><%= name %> Table</span></li>'
].join('\n');

Templates.tempHrefSelect = [
    '<select class="select-href" id="prop-<%= hash %>">',
    "<% _(listOfPages).each(function(page){ var b = ''; if(('internal://'+page) == val){ b = 'selected';}%>",
    '<option value="internal://<%= page %>" <%= b %>><%= page %></option>',
    '<%  }) %>',
    '<% if(external) { %><option value="<%= external %>" selected><%= external %></option><% }; %>',
    '<option value="external-link">External Link</option>',
    '</select>'
].join('\n');

Templates.tempSourceSelect = [
    '<select class="statics"  id="prop-<%= hash %>">',
    '<option class="upload-image">Placeholder</option>',
    "<% _(statics).each(function(asset){ var b = ''; if(asset == val){ b = 'selected';} %>",
    '<option value="<%= asset.url %>" <%= b %>><%= asset.name %></option>',
    '<%  }) %>',
    '<option class="upload-image" value="upload-image">+ Upload an image</option>',
    '</select>'
].join('\n');

Templates.tableNode = [
    '<table class="table table-bordered">',
    '<tr><% _(fieldsToDisplay).each(function(field) { %> <td><%= field %></td> <% }); %></tr>',
    '<tr><% _(fieldsToDisplay).each(function(field) { %> <td><i><%= field %>Data</i></td> <% }); %></tr>',
    '<tr><% _(fieldsToDisplay).each(function(field) { %> <td><i><%= field %>Data</i></td> <% }); %></tr>',
    '<tr><% _(fieldsToDisplay).each(function(field) { %> <td><i><%= field %>Data</i></td> <% }); %></tr>',
    '<tr><% _(fieldsToDisplay).each(function(field) { %> <td><i><%= field %>Data</i></td> <% }); %></tr>',
    '</table>'
].join('\n');

Templates.createFormButton = [
    '<li id="entity-<%= entity.cid %>-<%= form.cid %>" class="create entity">',
    '<span class="name"><%= form.get(\'name\') %> Form</span></li>'
].join('\n');

Templates.formButton = [
    '<li id="entity-<%= entity.cid %>-<%= form.cid %>" class="<%= form.get(\'action\') %> entity">',
    '<span class="name"><%= form.get(\'name\') %> Form</span></li>'
].join('\n');

var FieldTypes = {
    "single-line-text": '<input type="text" class="" placeholder="<%= field.get(\'placeholder\') %>">',
    "paragraph-text": '<textarea class="" placeholder="<%= field.get(\'placeholder\') %>"></textarea>',
    "dropdown": '<select class="drowdown"><% _(field.get(\'options\').split(\',\')).each(function(option, ind){ %><option><%= option %><% }); %></option>',
    "option-boxes": '<span class="option-boxes"><% _(field.get(\'options\').split(\',\')).each(function(option, ind){ %><div class="option"><input id="opt-<%= ind %>" class="field-type" type="radio" name="types" value="single-line-text"><label for="opt-<%= ind %>"><%= option %></label></div><% }); %></span>',
    "password-text": '<input type="password" class="password" placeholder="<%= field.get(\'placeholder\') %>">',
    "email-text": '<input type="text" class="email" placeholder="<%= field.get(\'placeholder\') %>">',
    "button": '<input type="submit" class="btn" value="<%= field.get(\'placeholder\') %>">',
    "image-uploader": '<div class="upload-image btn">Upload Image</div>',
    "file-uploader": '<div class="upload-file btn">Upload File</div>',
    "date-picker": '<div class="date-picker-wrapper"><input type="text" placeholder="<%= field.get(\'placeholder\') %>"><img class="date-picker-icon"></div>'
};


Templates.fieldNode = [
    '<label><%= field.get(\'label\') %></label>',
    '<% if(field.get(\'displayType\') == "single-line-text") { %>',
    FieldTypes['single-line-text'],
    '<% } %>',
    '<% if(field.get(\'displayType\') == "paragraph-text") { %>',
    FieldTypes['paragraph-text'],
    '<% } %>',
    '<% if(field.get(\'displayType\') == "dropdown") { %>',
    FieldTypes['dropdown'],
    '<% } %>',
    '<% if(field.get(\'displayType\') == "option-boxes") { %>',
    FieldTypes['option-boxes'],
    '<% } %>',
    '<% if(field.get(\'displayType\') == "password-text") { %>',
    FieldTypes['password-text'],
    '<% } %>',
    '<% if(field.get(\'displayType\') == "email-text") { %>',
    FieldTypes['email-text'],
    '<% } %>',
    '<% if(field.get(\'displayType\') == "button") { %>',
    FieldTypes['button'],
    '<% } %>',
    '<% if(field.get(\'displayType\') == "image-uploader") { %>',
    FieldTypes['image-uploader'],
    '<% } %>',
    '<% if(field.get(\'displayType\') == "file-uploader") { %>',
    FieldTypes['file-uploader'],
    '<% } %>',
    '<% if(field.get(\'displayType\') == "date-picker") { %>',
    FieldTypes['date-picker'],
    '<% } %>'
].join('\n');

Templates.queryView = [
    // '<small>',
    // '<p id="query-description"><%= c.nLang %></p>',
    // '</small>',
    '<div class="sections-container">',
    '<% if(type == "table") { %>',
    '<div class="sect">',
    '<p>What fields would you like to display?</p>',
    '<% _.each(entity.get("fields").models, function(field) { %>',
    '<% var checked = \'\'; var u_id = field.cid; if(_.contains(query.get(\'fieldsToDisplay\'), field.get(\'name\'))) { checked = \'checked\'; } %>',
    '<label><input class="fields-to-display btn" id="field-<%= field.cid %>" type="checkbox" value="<%= field.get(\'name\') %>" <%= checked %>><%= field.get(\'name\') %></label>',
    '<% }) %>',
    '</div>',
    '<% } %>',
    '<div class="sect">',
    '<% queries.each(function(query) { %>',
    '<input type="checkbox" class="query-option" id="query-<%= query.cid %>"><label for="query-<%= query.cid %>"><%= query.get("nl_description") %></label><br  />',
    '<% }); %>',
    '</div>',
    '<div class="sect">',
    '<p>How do you want to sort the rows?</p>',
    '<select class="sort-by">',
    '<option id="by-date" value="Date">From older to newer</option>',
    '<option id="by-date" value="-Date">From newer to older</option>',
    // '<% _.each(entity.get("fields").models, function(field) { %>',
    //   '<% var selected = "";  if("by-" + field.get("name") == query.get("sortAccordingTo")) selected = "selected" %>',
    //   '<option value="by-<%=field.get("name")%>" <%= selected %>>Alphabetically according to <%= field.get("name") %></option>',
    // '<% }); %>',
    '</select>',
    '</div>',

    '<div class="sect">',
    '<p>How many rows would you like to show?</p>',
    '<label><input type="radio" class="nmr-rows" id="all-rows" name="nmrRows" value="All" <%= c.rAll %>> All</label>',
    '<label><input type="radio" class="nmr-rows" id="first-rows" name="nmrRows" value="First" <%= c.rFirst %>> <input type="text" id="first-nmr" value="<%= c.rFirstNmr %>"> rows</label>',
    '</div>',
    '</div>'
].join('\n');


Templates.listEditorView = [
    '<span class="view-type-list type-pick"></span><span class="view-tyle-grid type-pick"></span>',
].join('\n');


Templates.tempUIElement = [
    '<<%= element.get(\'tagName\') %>',
    'class = "<%= element.get(\'class_name\') %>"',
    '<% if(element.get(\'cons_attribs\')) { %>',
    '<% _(element.get(\'cons_attribs\').attributes).each(function(val, key) { %>',
    '<%=key%> = "<%=val%>"<% }); %>',
    '<% } %>',
    '<% _(element.get(\'content_attribs\').attributes).each(function(val, key) { %>',
    '<%=key%> = "<%=val%>"<% }); %>>',
    '<% if(!element.get(\'isSingle\')) { %>',
    '<%= element.get(\'content\') %>',
    '</<%= element.get(\'tagName\') %>>',
    '<% }; %>'
].join('\n');

Templates.sliderTemp = [
    '<div id="slider-<%= cid %>" class="carousel slide">',
    '<ol class="carousel-indicators">',
    '<% for(var i=0; i < slides.length; i++) { %>',
    '<li data-target="#slider-<%= cid %>" data-slide-to="<%= i %>" <% if(i==0) { %>class="active" <% } %>></li>',
    '<% } %>',
    '</ol>',
    '<!-- Carousel items -->',
    '<div class="carousel-inner">',
    '<% _(slides).each(function(slide, index) { %>',
    '<div class="<% if(index == 0) { %>active <% } %>item">',
    '<img src="<%= slide.image %>">',
    '<div class="carousel-caption"><p><%= slide.text %></p></div>',
    '</div>',
    '<% }); %>',
    '</div>',
    '<!-- Carousel nav -->',
    '<a class="carousel-control left" href="#slider-<%= cid %>" data-slide="prev">&lsaquo;</a>',
    '<a class="carousel-control right" href="#slider-<%= cid %>" data-slide="next">&rsaquo;</a>',
    '</div>',
].join('\n');

Templates.twitterfeedTemp = [
    '<script src="http://widgets.twimg.com/j/2/widget.js"></script>',
    '<script>',
    'new TWTR.Widget({',
    'version: 2,',
    'type: \'profile\',',
    'rpp: 4,',
    'interval: 6000,',
    'width: \'auto\',',
    'height: 300,',
    'theme: {',
    'shell: {',
    'background: \'#aacceb\',',
    'color: \'#ffffff\'',
    '},',
    'tweets: {',
    'background: \'#000000\',',
    'color: \'#ffffff\',',
    'links: \'#1398f0\'',
    '}',
    '},',
    'features: {',
    'scrollbar: true,',
    'loop: false,',
    'live: true,',
    'hashtags: true,',
    'timestamp: true,',
    'avatars: true,',
    'behavior: \'all\'',
    '}',
    '}).render().setUser(\'<%= username %>\').start();',
    '</script>'
].join('\n');

Templates.facebookshareTemp = ['<img src="/static/img/fb-share-sample.png" width="300" >'].join('\n');

Templates.sliderEditorTemp = [
    '<div class="row">',
    '<ul class="slider-images" style="height:490px; overflow-y: scroll;">',
    '</ul>',
    '</div>'
].join('\n');

Templates.sliderImageEditorTemp = [
    '<li id="image-editor-<%= cid %>" class="span11 offset1 hoff1">',
    '<div class="thumbnail">',
    //'<img src="<%= image %>>',
    '<img src="<%= image %>">',
    '<p><textarea type="text" class="text" id="edit-<%= cid %>"><%= text %></textarea></p>',
    '<span class="btn btn-danger btn-small remove" id="remove-<%= cid %>">Remove</span>',
    '</div>',
    '</li>'
].join('\n');

Templates.thirdPartyLogin = [
    '<div class="<%= provider %>-login-btn btn"><%= content %></div>'
].join('\n');


Templates.searchboxTemp = [
    '<form class="search-box">',
    '<input type="text" placeholder="Search for  <%= entityName %>…">',
    '<input type="submit" class="btn" value="Search">',
    '</form>'
].join('\n');

exports.EditorTemplates = Templates;

});

require.define("/plugins_view/PluginsView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';
    require('../mixins/BackboneDropdownView');
    var PluginBrowserView = require('./PluginBrowserView');

    var tempPluginsView = [
        '<div class="hoff1">',
        '<h2 class="pheader">',
        'Installed Plugins',
        '</h2>',
        "<button id='browsePlugins' class='btn pull-right browsePluginsButton'>Browse All</button>",
        "<hr>",
        "<div class='pluginContainer'>",
        "<% for (var i=0; i<plugins.length;i++) { if (!plugins[i].metadata) {  plugins[i].metadata={}; plugins[i].metadata.name = plugins[i].name; plugins[i].metadata.description = ''; } %>",
        '<div class="pluginBar">',
        '<div class="identifier"><div class="pluginImageHolder"></div></div>',
        '<div class="meta-data">',
        '<a class="title" href="#""><%=plugins[i].metadata.name%></a>',
        '<div class="information"> <%=plugins[i].metadata.description%></div>',
        '</div>',
        '<div id="delete-plugin-<%= plugins[i].metadata.name %>" class="delete-plugin">X</div>',
        '</div>',
        '<hr>',
        '<% } %>',
        '</div>',
        '</div>'
    ].join('\n');


    var PluginsView = Backbone.DropdownView.extend({

        title: 'Plugins',

        className: 'dropdown-view plugins-view',

        events: {
            'click .delete-plugin': 'deletePlugin',
            'click .browsePluginsButton': 'browsePlugins'
        },

        initialize: function () {
            _.bindAll(this);
            this.listenTo(v1State.get('plugins'), 'change', this.render);
        },

        render: function () {
            var plugins = v1State.get('plugins').serialize();
            plugins = _.map(plugins, function (val, key) {
                val.name = key;
                return val;
            });
            this.$el.html(_.template(tempPluginsView, {
                plugins: plugins
            }));

            return this;
        },

        browsePlugins: function () {
            var browserView = new PluginBrowserView({});
        },

        deletePlugin: function (e) {

            var delButton = $(e.target);
            var elToRemove = delButton.parents('.pluginBar');
            var pluginName = delButton.attr('id').replace('delete-plugin-', '');

            v1.currentApp.model.get('plugins').uninstall(pluginName);
        },

        getActivePlugins: function () {

            var enabledPlugins = v1.currentApp.model.get('plugins').filter(
                function (p) {
                    return p.getPluginStatus();
                }
            );

            return enabledPlugins;
        }
    });

    exports.PluginsView = PluginsView;

});

require.define("/mixins/BackboneDropdownView.js",function(require,module,exports,__dirname,__filename,process,global){        Backbone.DropdownView = Backbone.View.extend({

            toggleElement: null,
            events: {

            },
            _configure: function (options) {
                Backbone.DropdownView.__super__._configure.call(this, options);
                _.bindAll(this);
            },

            _ensureElement: function (options) {
                Backbone.DropdownView.__super__._ensureElement.call(this, options);
            },

            setToggleEl: function ($el) {
                this.$toggleEl = $el;
                var self = this;
                $el.on('click', function () {
                    self.toggle();
                });
            },
            // Set the displacement of the little pointer
            setPointerPosition: function (offset) {

            },

            toggle: function () {
                if (this.isExpanded) {
                    this.hide();
                } else {
                    this.expand();
                }
            },

            expand: function () {
                this.$el.addClass('expanded');
                this.$toggleEl.addClass('expanded');
                this.isExpanded = true;
                $(window).on('mouseup', this.clickedOnElement);
                $($('#inviteFrame').contents().get(0)).on('mouseup', this.clickedOnElement);
                $(window).on('keydown', this.closeHandler);

            },

            hide: function () {
                this.$el.removeClass('expanded');
                this.$toggleEl.removeClass('expanded');

                this.isExpanded = false;
                $(window).off('mouseup', this.clickedOnElement);
                $($('#inviteFrame').contents().get(0)).off('mouseup', this.clickedOnElement);
                $(window).off('keydown', this.closeHandler);
            },

            clickedOnElement: function (e) {
                var container = this.$el;
                var toggleEl = this.$toggleEl;
                // if the target of the click isn't the container
                // ... nor a descendant of the container
                if (!container.is(e.target) && !toggleEl.is(e.target) &&
                    container.has(e.target).length === 0 && toggleEl.has(e.target).length === 0) {
                    this.hide();
                }
            },

            closeHandler: function (e) {
                if (e.keyCode == 27) {
                    this.hide();
                }
            }

        });

});

require.define("/plugins_view/PluginBrowserView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

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

});

require.define("/SettingsView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';
    require('./mixins/BackboneDropdownView');

    var SettingsView = Backbone.DropdownView.extend({
        title: 'Plugins',
        className: 'dropdown-view settings-view',
        subviews: [],

        events: {
            "keyup #scripts-content": "scriptsChanged",
            "keyup #header-content": "headerChanged"
        },

        initialize: function () {
            _.bindAll(this);
            this.model = v1State;
        },

        render: function () {

            var template = [
                '<div class="" id="settings-page">',
                '<h2 class="pheader">App Settings</h2>',
                '<ul id="list-tables">',
                '<li>',
                '<h3>Header</h3>',
                '<textarea id="header-content"><%= header_content %></textarea>',
                '</li>',
                '<li>',
                '<h3>Scripts</h3>',
                '<textarea id="scripts-content"><%= scripts_content %></textarea>',
                '</li>',
                '</ul>',
                '</div>'
            ].join('\n');

            this.el.innerHTML = _.template(template, {
                header_content: this.model.get("header") || "",
                scripts_content: this.model.get("scripts") || ""
            });
            return this;
        },

        scriptsChanged: function (e) {
            console.log(e.currentTarget.value);
            this.model.set("scripts", e.currentTarget.value);
        },

        headerChanged: function (e) {
            this.model.set("header", e.currentTarget.value);
        }

    });

    exports.SettingsView = SettingsView;

});

require.define("/RoutesView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    require('./mixins/BackboneDropdownView');
    var RouteView = require('./RouteView').RouteView;

    var template = ['<div class="arrow_box"></div>',
        '<div class="" id="entities-page">',
        '<h2 class="pheader">Routes</h2>',
        '<ul id="list-routes">',
        '</ul>',
        '</div>'
    ].join('\n');

    var RoutesView = Backbone.DropdownView.extend({

        title: 'Tables',
        className: 'dropdown-view routes-view',
        events: {
            'click .route-name': 'clickedRoute'
        },

        initialize: function () {
            _.bindAll(this);

            this.collection = v1State.get('routes');
            this.listenTo(this.collection, 'add', this.renderRoute);
            this.listenTo(this.collection, 'remove', this.removeRoute);

            this.title = "Routes";
        },

        render: function () {

            this.$el.html(_.template(template, {}));
            this.renderRoutes();
            // this.renderRelations();

            var addTableBtn = document.createElement('div');
            addTableBtn.id = 'add-entity';
            addTableBtn.innerHTML = '<span class="box-button">+ Create Route</span>';

            var createRouteBox = new Backbone.NameBox({}).setElement(addTableBtn).render();
            createRouteBox.on('submit', this.createRoute);

            this.$el.append(addTableBtn);
            return this;
        },

        renderRoutes: function () {
            this.collection.each(this.renderRoute);
        },

        renderRoute: function (routeModel) {
            var routeView = new RouteView(routeModel);
            this.$el.find('#list-routes').append(routeView.render().el);
        },

        removeRoute: function (routeModel) {
            this.$el.find('#route-' + routeModel.cid).remove();
        },

        createRoute: function (val) {

            var templateName = prompt("Would you like to create a template as well?", val);

            if (templateName != null) {
                v1State.get('templates').push({
                    name: templateName
                });
            }

            var name = templateName || null;
            var routeModel = this.collection.push({
                url: val.split('/'),
                name: name
            });

            routeModel.setGenerator("routes.staticpage");

        }

    });

    exports.RoutesView = RoutesView;

});

require.define("/RouteView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';
    require('./mixins/BackboneDropdownView');

    var WidgetSettingsView = require('./template_editor/WidgetSettingsView').WidgetSettingsView;

    var template = [
        '<small class="url-name"><%= url %></small>',
        '<span class="pull-right">',
        '<%= options %>',
        '<div class="option-button settings blue"></div>',
        '<span class="cross">×<span>',
        '</span>'
    ].join('\n');


    var RouteView = Backbone.DropdownView.extend({

        tagName: 'li',
        className: 'route-name',

        events: {
            'click .url-name': 'clickedRoute',
            'click .cross': 'removeRoute',
            'click .settings': 'clickedSettings'
        },

        initialize: function (model) {
            _.bindAll(this);
            this.model = model;

            this.listenTo(this.model, 'remove', this.close);
        },

        render: function () {
            var name = this.model.get('name');
            var url = this.model.getUrlString();

            var options = "(Custom Code)";

            if (this.model.generate == "routes.staticpage") {
                var options = '<select>'
                options += '<option>' + this.model.get('name') + ' template</option>';

                v1State.get('templates').each(function (templateModel) {
                    if (templateModel.get('name') == name) return;

                    options += '<option>' + templateModel.get('name') + ' template</option>';
                });

                options += '</select>';
            }

            this.$el.html(_.template(template, {
                options: options,
                url: url
            }));

            return this;
        },

        clickedRoute: function () {

            if (this.model.generate == "routes.staticpage") {
                var template = this.model.get('name');
                v1.currentApp.pageWithName(template);
            }

        },

        clickedSettings: function () {
            new WidgetSettingsView(this.model).render();
        },

        removeRoute: function (e) {
            e.preventDefault();
            v1State.get('routes').remove(this.model);

            return false;
        }

    });

    exports.RouteView = RouteView;

});

require.define("/SoftErrorView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    require('./mixins/BackboneModal');

    var SoftErrorView = Backbone.View.extend({
        className: 'soft-error-modal',
        events: {
            'click': 'close'
        },
        top: false,

        initialize: function (options, closeCallback) {
            _.bindAll(this);

            this.text = options.text;
            this.path = options.path;

            // wrap the callback in a function, since the callback may be undefined
            this.closeCallback = function () {
                if (typeof (closeCallback) == 'function') return closeCallback();
                else return false;
            };
            this.render();
        },

        resolve: function () {
            var arr = this.path.split('/');
            var el = arr[0];
            var str = "<p>";

            switch (el) {
            case "pages":
                var pageObj = appState.pages[arr[1]];
                str += "Problem is on <a href='/app/" + appId + "/page/" + arr[1] + "/'>" + pageObj.name + '</a>';
                break;
            }

            str += "</p>";

            switch (arr[2]) {
            case "uielements":
                var widgetObj = v1State.get('pages').models[arr[1]].get('uielements').models[arr[3]];

                var iframe = document.getElementById('page');
                if (iframe) {
                    var innerDoc = iframe.contentDocument || iframe.contentWindow.document;
                    var domEl = innerDoc.getElementById('widget-wrapper-' + widgetObj.cid);

                    if (domEl) {
                        this.overlayEl = util.addOverlay(domEl);
                    } else {
                        this.listenTo(v1, 'editor-loaded', function () {
                            var domEl = document.getElementById('widget-wrapper-' + widgetObj.cid);
                            var self = this;
                            setTimeout(function () {
                                self.overlayEl = util.addOverlay(domEl);
                            }, 300);
                        }, this);
                    }
                }
            }

            return str;
        },

        render: function () {

            var div = document.createElement('div');
            div.className = "modal-bg fadeIn";
            div.style.position = 'fixed';
            div.style.width = '100%';
            div.style.height = '100%';
            div.style.top = '0';
            div.style.left = '0';
            div.style.backgroundColor = '#222';
            div.style.opacity = '0.6';
            div.style.zIndex = 3000;
            document.body.appendChild(div);
            this.bgDiv = div;

            var speech = document.createElement('span');
            speech.innerHTML = this.text + this.resolve(this.path);
            var button = document.createElement('div');
            button.className = 'btn-info btn';
            button.innerHTML = 'OK, Got it!';

            this.el.appendChild(speech);
            this.el.appendChild(button);
            document.body.appendChild(this.el);

            return this;
        },

        close: function () {
            $(this.bgDiv).remove();
            if (this.overlayEl) $(this.overlayEl).remove();
            this.stopListening(v1, 'editor-loaded');
            this.closeCallback();
            SoftErrorView.__super__.close.call(this);
        }

    });

    exports.SoftErrorView = SoftErrorView;

});

require.define("/models_view/NodeModelsView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var NodeModelModel = require('../models/NodeModelModel');
    var NodeModelView = require('./NodeModelView');
    require('../mixins/BackboneDropdownView');

    var template = ['<div class="arrow_box"></div>',
        '<div class="" id="entities-page">',
        '<h2 class="pheader">Models</h2>',
        '<ul id="list-tables">',
        '</ul>',
        '</div>'
    ].join('\n');

    var NodeModelsView = Backbone.DropdownView.extend({

        title: 'Tables',
        className: 'dropdown-view entities-view',
        events: {
            'click .table-name': 'clickedTableName',
            'click .remove-model': 'clickedRemoveTable'
        },
        subviews: [],

        initialize: function () {
            _.bindAll(this);
            this.subviews = [this.tablesView, this.relationsView, this.createRelationView];
            this.collection = v1State.get('models');
            this.listenTo(this.collection, 'add', this.renderTable);
            this.listenTo(this.collection, 'remove', this.removeTable);

            this.title = "Tables";
        },

        render: function () {

            this.$el.html(_.template(template, {}));
            this.renderTables();
            // this.renderRelations();

            var addTableBtn = document.createElement('div');
            addTableBtn.id = 'add-entity';
            addTableBtn.innerHTML = '<span class="box-button">+ Create Model</span>';

            var createTableBox = new Backbone.NameBox({}).setElement(addTableBtn).render();
            createTableBox.on('submit', this.createTable);
            this.subviews.push(createTableBox);

            this.$el.append(addTableBtn);
            return this;
        },

        renderTables: function () {
            this.collection.each(this.renderTable);
            //this.$('#users').append(this.userTablesView.render().el);
        },

        renderTable: function (tableModel) {
            this.$el.find('#list-tables').append('<li class="table-name" id="table-' + tableModel.cid + '">' + tableModel.get('name') + '<span class="remove-model pull-right" id="remove-table-' + tableModel.cid + '">×<span></li>');
        },

        removeTable: function (tableModel) {
            this.$el.find('#table-' + tableModel.cid).remove();
        },

        clickedTableName: function (e) {
            var cid = String(e.currentTarget.id).replace('table-', '');
            var tableModel = v1State.get('models').get(cid);
            var tableView = new NodeModelView(tableModel);
            tableView.render();
            // this.el.appendChild(tableView.render().el);
        },

        clickedRemoveTable: function (e) {
            e.preventDefault();

            var cid = String(e.currentTarget.id).replace('remove-table-', '');
            var tableModel = v1State.get('models').get(cid);
            var modelName = tableModel.get('name');

            var r = confirm("Are you sure you want to delete " + modelName + " model?");
            if (r == true) {
                v1State.get('models').remove(tableModel);
            }

            return false;
        },

        renderRelations: function () {
            //util.get('relations').appendChild(this.createRelationView.render().el);
            //util.get('relations').appendChild(this.relationsView.render().el);
        },

        createTable: function (val) {
            //force table names to be singular
            var name = val;

            var elem = new NodeModelModel({
                name: name,
                fields: []
            });

            v1State.get('models').push(elem);
            return elem;
        },

        showCreateRelationForm: function () {
            var self = this;
            this.createRelationView.$el.fadeIn('fast');
            util.scrollToElement(self.$('#new-relation'));
        },

        scrollToRelation: function (e) {
            e.preventDefault();
            var hash = e.currentTarget.hash;
            if (hash === '#relation-new') {
                this.showCreateRelationForm();
                return;
            }
            util.scrollToElement($(hash));
        }
    });

    exports.NodeModelsView = NodeModelsView;

});

require.define("/models_view/NodeModelView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var FieldModel = require('../models/FieldModel').FieldModel;
    //var AdminPanelView = require('../AdminPanelView').AdminPanelView;

    var NodeModelPluginsView = require('./NodeModelPluginsView').NodeModelPluginsView;
    var NodeModelDescriptionView = require('./NodeModelDescriptionView').NodeModelDescriptionView;
    var TableDataView = require('./NodeModelDataView').NodeModelDataView;
    var TableCodeView = require('./NodeModelCodeView').NodeModelCodeView;


    var SoftErrorView = require('../SoftErrorView');
    var DialogueView = require('../mixins/DialogueView');
    require('../mixins/BackboneCardView');

    var tableTemplate = [
        '<div class="header">',
        '<div>',
        '<h2><%= name %></h2>',
        '<div class="q-mark-circle"></div>',
        '</div>',
        '<ul class="tabs">',
        '<li class="description-li right-icon">',
        '<span>Description</span>',
        '</li><li class="code-li right-icon">',
        '<span>Code</span>',
        '</li><li class="data-li right-icon">',
        '<span>Access Data</span>',
        '</li>',
        '</ul>',
        '</div>',
        '<div class="current-content"></div>',
    ].join('\n');

    var NodeModelView = Backbone.CardView.extend({
        el: null,
        tagName: 'div',
        collection: null,
        parentName: "",
        className: 'entity-pane',
        subviews: [],

        events: {
            'change .attribs': 'changedAttribs',
            'click .q-mark-circle': 'showTableTutorial',
            'click .right-icon': 'tabClicked'
        },


        initialize: function (tableModel) {
            _.bindAll(this);
            this.model = tableModel;
            this.listenTo(this.model, 'remove', this.remove);
            this.listenTo(this.model, 'newRelation removeRelation', this.renderRelations);
            this.otherEntities = _(v1State.get('models').pluck('name')).without(this.model.get('name'));
        },

        render: function () {
            this.el.innerHTML = _.template(tableTemplate, this.model.toJSON());
            this.el.id = 'table-' + this.model.cid;
            this.renderDescription();

            return this;
        },

        renderDescription: function () {
            this.$el.find('.current-content').html('');
            this.$el.find('.current-content').append(new NodeModelDescriptionView(this.model).render().el);
            var nodeModelPlugins = new NodeModelPluginsView(this.model);

            //.render().el
            this.$el.find('.current-content').append(nodeModelPlugins.render().el);
            this.$el.find('.description-li').addClass('active');
        },

        renderData: function () {
            this.$el.find('.current-content').html('');
            this.$el.find('.current-content').append(new TableDataView(this.model).render().el);
            this.$el.find('.data-li').addClass('active');
        },

        renderCode: function () {
            var tableCodeView = new TableCodeView(this.model);
            this.$el.find('.current-content').html('');
            this.$el.find('.current-content').append(tableCodeView.render().el);
            tableCodeView.setupAce();
            this.$el.find('.code-li').addClass('active');
        },

        tabClicked: function (e) {
            this.$el.find('.active').removeClass('active');
            if ($(e.currentTarget).hasClass('description-li')) {
                this.renderDescription();
            } else if ($(e.currentTarget).hasClass('data-li')) {
                this.renderData();
            } else if ($(e.currentTarget).hasClass('code-li')) {
                this.renderCode();
            }
        },

        addedEntity: function (item) {
            var optString = '<option value="{{' + item.get('name') + '}}">List of ' + item.get('name') + 's</option>';
            $('.attribs', this.el).append(optString);
        },

        clickedDelete: function (e) {
            this.askToDelete(v1State.get('tables'));
        },

        askToDelete: function (tableColl) {
            var widgets = v1State.getWidgetsRelatedToTable(this.model);
            var model = this.model;
            if (widgets.length) {

                var widgetsNL = _.map(widgets, function (widget) {
                    return widget.widget.get('type') + ' on ' + widget.pageName;
                });
                var widgetsNLString = widgetsNL.join('\n');
                new DialogueView({
                    text: "The related widgets listed below will be deleted with this table. Do you want to proceed? <br><br> " + widgetsNLString
                }, function () {
                    tableColl.remove(model.cid);
                    v1State.get('pages').removePagesWithContext(model);
                    _.each(widgets, function (widget) {
                        widget.widget.collection.remove(widget.widget);
                    });
                });

            } else {
                tableColl.remove(model.cid);
                v1State.get('pages').removePagesWithContext(model);
            }
        },

        typeClicked: function (e) {
            var cid = e.target.id.replace('type-row-', '');
            $('#type-' + cid).click();
            e.preventDefault();
        },

        showTableTutorial: function (e) {
            v1.showTutorial("Tables");
        }

    });

    exports.NodeModelView = NodeModelView;

});

require.define("/models_view/NodeModelPluginsView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var NodeModelMethodModel = require('../models/NodeModelMethodModel');

    var pluginAttribsTemplate = [
        '<div class="plugins-list">',
        '<% _.each(plugins, function(plugin, i) { %>',
        '<div class="plugin-li">',
        '<h4><%= plugin.name %></h4>',
        '<div class="onoffswitch nodemodel" id="myonoffswitch-wrapper-<%=i%>">',
        '<input type="checkbox" name="onoffswitch<%=i%>" class="onoffswitch-checkbox <%= plugin.isChecked %>" id="myonoffswitch<%=i%>" >',
        '<label class="onoffswitch-label" for="myonoffswitch<%=i%>">',
        '<div class="onoffswitch-inner"></div>',
        '<div class="onoffswitch-switch"></div>',
        '</label>',
        '</div>',
        '</div>',
        '<% }); %>',
        '</div>'
    ].join('\n');

    var NodeModelPluginsView = Backbone.View.extend({

        className: 'description-view description-plugins',
        subviews: [],

        events: {
            'click .onoffswitch.nodemodel': 'clickedPluginToggle'
        },


        initialize: function (tableModel) {
            _.bindAll(this);
            this.model = tableModel;
        },

        render: function () {
            var plugins = v1State.get('plugins').getAllPluginsWithModule('model_methods');


            var gens = _.map(plugins, function (pluginM) {
                var gen = {};
                try {
                    gen.name = pluginM.name || pluginM.get('metadata').name
                } catch (e) {
                    gen.name = "Unnamed";
                    alert("There is an unnamed plugin.");
                }

                if (v1State.get('plugins').isPluginInstalledToModel(pluginM, this.model)) {
                    gen.isChecked = "checked";
                } else {
                    gen.isChecked = "";
                }

                return gen;
            }, this);

            this.plugins = plugins;
            var html = _.template(pluginAttribsTemplate, {
                plugins: gens
            });
            this.el.innerHTML = html;

            return this;
        },

        clickedPluginToggle: function (e) {

            var pluginInd = e.currentTarget.id.replace('myonoffswitch-wrapper-', '');
            var isChecked = this.$el.find('#myonoffswitch' + pluginInd).hasClass('checked');

            if (isChecked) {
                v1State.get("plugins").uninstallPluginToModel(this.plugins[pluginInd], this.model);
                this.$el.find('#myonoffswitch' + pluginInd).removeClass('checked');
            } else {
                v1State.get("plugins").installPluginToModel(this.plugins[pluginInd], this.model);
                this.$el.find('#myonoffswitch' + pluginInd).addClass('checked');
            }

            e.preventDefault();
        },

        changedAttribs: function (e) {
            var props = String(e.target.id).split('-');
            var cid = props[1];
            var attrib = props[0];
            var value = e.target.options[e.target.selectedIndex].value || e.target.value;
            this.fieldsCollection.get(cid).set(attrib, value);
        },

        addedEntity: function (item) {
            var optString = '<option value="{{' + item.get('name') + '}}">List of ' + item.get('name') + 's</option>';
            $('.attribs', this.el).append(optString);
        },

        clickedPropDelete: function (e) {
            var cid = String(e.target.id || e.target.parentNode.id).replace('delete-', '');

            var model = this.fieldsCollection.get(cid);
            var widgets = v1State.getWidgetsRelatedToField(model);

            _.each(widgets, function (widget) {
                widget.widget.getForm().removeFieldsConnectedToField(model);
            });

            this.fieldsCollection.remove(cid);
            $('#column-' + cid).remove();
        },

        clickedUploadExcel: function (e) {
            new AdminPanelView();
        },

        showTableTutorial: function (e) {
            v1.showTutorial("Tables");
        }

    });

    exports.NodeModelMethodModel = NodeModelMethodModel;

});

require.define("/models_view/NodeModelDescriptionView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var FieldModel = require('../models/FieldModel');
    // var AdminPanelView = require('../AdminPanelView');
    var SoftErrorView = require('../SoftErrorView');
    var DialogueView = require('../mixins/DialogueView');
    require('../mixins/BackboneCardView');

    var descriptionTemplate = [
        '<div class="description">',
        '<span class="tbl-wrapper">',
        '<span class="tbl">',
        '<ul class="property-list">',
        '<div class="column header">',
        '<div class="hdr">Property</div>',
        '<div class="type-field desc">Type</div>',
        '</div>',
        '</ul>',
        '<div class="column add-property-column">',
        '<form class="add-property-form" style="display:none">',
        '<input type="text" class="property-name-input" placeholder="Property Name...">',
        '<input type="submit" class="done-btn" value="Done">',
        '</form>',
        '<span class="add-property-button box-button"><span class="plus-icon"></span>Add Property</span>',
        '</div>',
        '</span>',
        '</span>',
        '</div>'
    ].join('\n');


    var propertyTemplate = [
        '<div class="column <% if(isNew) { %>newcol<% } %>" id="column-<%- cid %>">',
        '<div class="hdr"><%- name %></div>',
        '<div class="type-field" id="type-row-<%- cid %>">',
        '<select class="attribs" id="type-<%- cid %>">',
        '<% _.each(fieldTypes, function(fieldType) { %>',
        '<option value="<%= fieldType %>" <% if(type == fieldType) %> selected <% %>><%= fieldType %></option>',
        '<% }); %>',
        '</select>',
        '</div>',
        '<div class="prop-cross" id="delete-<%- cid %>">',
        '<div class="remove hoff1">Remove</div>',
        '</div>',
        '</div>'
    ].join('\n');

    var mongooseTypes = [
        'String',
        'Number',
        'Date',
        'Boolean',
        'Buffer'
    ];

    var NodeModelDescriptionView = Backbone.View.extend({
        el: null,
        tagName: 'div',
        collection: null,
        parentName: "",
        className: 'description-view',
        subviews: [],

        events: {
            'change .attribs': 'changedAttribs',
            'click .q-mark-circle': 'showTableTutorial',
            'click .remove': 'clickedPropDelete',
            'mouseover .right-arrow': 'slideRight',
            'mousemove .right-arrow': 'slideRight',
            'mouseover .left-arrow': 'slideLeft',
            'mousemove .left-arrow': 'slideLeft',
            'click     .right-arrow': 'slideRight',
            'click .type-field': 'typeClicked'
        },


        initialize: function (tableModel) {
            _.bindAll(this);
            this.model = tableModel;
            this.fieldsCollection = tableModel.getFieldsColl();

            this.listenTo(this.model, 'remove', this.remove);
            this.listenTo(this.model.get('fields'), 'add', this.appendField, true);
            this.listenTo(this.model.get('fields'), 'remove', this.removeField);
            this.listenTo(this.model, 'newRelation removeRelation', this.renderRelations);

            this.otherEntities = _(v1State.get('models').pluck('name')).without(this.model.get('name'));
            this.bindDupeWarning();
        },

        render: function () {

            var html = _.template(descriptionTemplate, this.model.serialize());

            this.$el.html(html);

            this.renderProperties();

            this.addPropertyBox = new Backbone.NameBox({}).setElement(this.$el.find('.add-property-column').get(0)).render();
            this.subviews.push(this.addPropertyBox);
            this.addPropertyBox.on('submit', this.createNewProperty);

            return this;
        },

        renderProperties: function () {
            this.fieldsCollection.each(function (field) {
                // only render non-relational properties
                if (!field.isRelatedField()) {
                    this.appendField(field);
                }
            }, this);
        },

        bindDupeWarning: function () {
            this.listenTo(this.fieldsCollection, 'duplicate', function (key, val) {
                new SoftErrorView({
                    text: "Duplicate entry should not be duplicate. " + key + " of the field should not be the same: " + val,
                    path: ""
                });
            });
        },

        clickedAddProperty: function (e) {
            this.$el.find('.add-property-button').hide();
            this.$el.find('.add-property-form').fadeIn();
            $('.property-name-input', this.el).focus();
        },

        createNewProperty: function (val) {
            var name = val;
            if (!name.length) return;
            var newField = new FieldModel({
                name: name
            });
            this.fieldsCollection.push(newField);
        },

        appendField: function (fieldModel, isNew) {
            // don't append field if it's a relational field
            if (fieldModel.isRelatedField()) {
                return false;
            }
            var page_context = {};
            page_context = _.clone(fieldModel.attributes);
            page_context.cid = fieldModel.cid;
            page_context.entityName = this.model.get('name');
            page_context.entities = this.otherEntities;
            page_context.isNew = isNew;

            var types = v1State.get('models').map(function (nodeModelModel) {
                // { type: Schema.Types.ObjectId, ref: "Studio" }
                if (page_context.type == "{ type: Schema.Types.ObjectId, ref: '" + nodeModelModel.get('name') + "'}") {
                    page_context.type = "{ ref: '" + nodeModelModel.get('name') + "',  type: Schema.Types.ObjectId}";
                }

                return "{ ref: '" + nodeModelModel.get('name') + "',  type: Schema.Types.ObjectId}";
            });
            types = _.union(types, mongooseTypes);

            page_context.fieldTypes = types;

            var template = _.template(propertyTemplate, page_context);

            this.$el.find('.property-list').append(template);
        },

        removeField: function (fieldModel) {
            this.$el.find('#column-' + fieldModel.cid).remove();
        },

        changedAttribs: function (e) {
            var cid = String(e.currentTarget.id).replace('type-', '');
            var value = e.currentTarget.value;
            this.fieldsCollection.get(cid).set("type", value);
        },

        addedEntity: function (item) {
            var optString = '<option value="{{' + item.get('name') + '}}">List of ' + item.get('name') + 's</option>';
            $('.attribs', this.el).append(optString);
        },

        clickedDelete: function (e) {
            this.askToDelete(v1State.get('tables'));
        },

        askToDelete: function (tableColl) {
            var widgets = v1State.getWidgetsRelatedToTable(this.model);
            var model = this.model;
            if (widgets.length) {

                var widgetsNL = _.map(widgets, function (widget) {
                    return widget.widget.get('type') + ' on ' + widget.pageName;
                });
                var widgetsNLString = widgetsNL.join('\n');
                new DialogueView({
                    text: "The related widgets listed below will be deleted with this table. Do you want to proceed? <br><br> " + widgetsNLString
                }, function () {
                    tableColl.remove(model.cid);
                    v1State.get('pages').removePagesWithContext(model);
                    _.each(widgets, function (widget) {
                        widget.widget.collection.remove(widget.widget);
                    });
                });

            } else {
                tableColl.remove(model.cid);
                v1State.get('pages').removePagesWithContext(model);
            }
        },

        clickedPropDelete: function (e) {
            var cid = String(e.target.id || e.target.parentNode.id).replace('delete-', '');
            this.fieldsCollection.remove(cid);
        },

        clickedUploadExcel: function (e) {
            new AdminPanelView();
        },

        renderRelations: function () {
            var tableRelations = v1State.get('models').getRelationsWithEntityName(this.model.get('name'));
            var list = this.$el.find('.related-fields').empty();
            _(tableRelations).each(function (relation) {
                var suffix;
                var text = 'Has ' + relation.related_name;
                if (relation.type == "m2m" || relation.type == "fk") suffix = 'List of ' + util.pluralize(relation.entity);
                if (relation.type == "o2o") suffix = 'Single ' + relation.entity;
                list.append('<a href="#relation-' + relation.cid + '"class="related-tag offset1">' + text + ' (' + suffix + ')</a>');
            });
            list.append('<a href="#relation-new" class="related-tag offset1"><span style="font-size: 13px">+</span>  Add a data relationship</a>');
        },

        initializeTableWidth: function () {
            var width = (this.model.getFieldsColl().length + 2) * 100;
            width += 120;
            this.width = width;
            if (this.width < 300) this.width = 300;
            this.$el.find('.tbl').width(this.width);
            if (width > 870 && !this.hasArrow) {
                this.hasArrow = true;
                var div = document.createElement('div');
                div.className = 'right-arrow';
                this.$el.find('.description').append(div);
            }
        },

        slideRight: function () {
            var left = this.$el.find('.tbl-wrapper').scrollLeft();
            this.$el.find('.tbl-wrapper').scrollLeft(left + 6);
            if (!this.hasLeftArrow) {
                var div = document.createElement('div');
                div.className = 'left-arrow';
                this.$el.find('.description').append(div);
                this.hasLeftArrow = true;
            }
        },

        slideLeft: function () {
            var tblWrapper = this.$el.find('.tbl-wrapper');
            var left = tblWrapper.scrollLeft();
            tblWrapper.scrollLeft(left - 6);
            if (tblWrapper.scrollLeft() === 0) {
                this.$el.find('.left-arrow').remove();
                this.hasLeftArrow = false;
            }
        },

        typeClicked: function (e) {
            var cid = e.target.id.replace('type-row-', '');
            $('#type-' + cid).click();
            e.preventDefault();
        },

        showTableTutorial: function (e) {
            v1.showTutorial("Tables");
        }

    });

    exports.NodeModelDescriptionView = NodeModelDescriptionView;

});

require.define("/models_view/NodeModelDataView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

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

});

require.define("/models_view/NodeModelCodeView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var SoftErrorView = require('../SoftErrorView').SoftErrorView;
    var DialogueView = require('../mixins/DialogueView').DialogueView;
    var NodeModelMethodModel = require('../models/NodeModelMethodModel').NodeModelMethodModel;
    var WidgetSettingsView = require('../template_editor/WidgetSettingsView').WidgetSettingsView;

    var funcTemplate = [
        '<div class="code-chunk" id="func-chunk-<%= cid %>">',
        '<span class="title">',
        '<%= name %>',
        '<div class="option-button settings blue pull-right" id="func-settings-<%= cid %>"></div>',
        '<span class="func-type-container"></span>',
        '</span>',
        '<div class="code-editor" id="func-editor-<%= cid %>"></div>',
        '</div>'
    ].join('\n');

    var FuncChooserView = Backbone.View.extend({
        tagName: 'span',
        className: 'func-type-container',
        events: {
            'click .func-type-change': 'changeTypeHandler',
        },
        initialize: function (el, methodModel) {
            this.setElement(el);
            this.methodModel = methodModel;
            _.bindAll(this);
        },
        render: function () {
            var funcTypeTemplate = '<span class="func-type"><%= funcType %></span>';
            if (!this.methodModel.isGenerator())
                funcTypeTemplate += '<button class="func-type-change" type="button">Change type</button>';
            this.$el.html(_.template(funcTypeTemplate, {
                funcType: this.methodModel.getType()
            }));
            return this;
        },
        changeTypeHandler: function () {
            var newType = this.methodModel.toggleType();
            this.$el.find('.func-type').text(newType);
        },
    });

    var NodeModelCodeView = Backbone.View.extend({

        tagName: 'div',
        parentName: "",
        className: 'code-view',
        subviews: [],

        events: {
            'click .settings': 'clickedSettings'
        },


        initialize: function (tableModel) {
            _.bindAll(this);
            this.model = tableModel;

            this.listenTo(this.model.get('functions'), 'add', this.renderStaticMethod);
            this.listenTo(this.model.get('functions'), 'remove', this.removeMethod);
        },

        render: function () {

            this.el.innerHTML = [
                '<div class="static sect">',
                '<span class="title">Functions</span>',
                '<div id="static-methods-list"></div>',
                '<div id="add-static-box">',
                '<form style="display:none;">',
                '<input type="text" class="property-name-input" placeholder="Property Name...">',
                '<input type="submit" class="done-btn" value="Done">',
                '</form>',
                '<div class="add-button box-button">+ Create a New Function</div>',
                '</div>',
                '</div>'
            ].join('\n');

            var self = this;

            var list = this.$el.find('#static-methods-list')[0];
            this.list = list;

            this.model.get('functions').each(function (methodModel, i) {
                var methodObj = methodModel.getGenerated();
                list.innerHTML += _.template(funcTemplate, {
                    name: methodObj.name,
                    cid: methodModel.cid
                });
            });
            _.each($(list).find('.func-type-container'), function (el, i) {
                var methodModel = self.model.get('functions').at(i);
                var fcv = new FuncChooserView(el, methodModel);
                fcv.render();
            });

            this.addPropertyBox = new Backbone.NameBox({}).setElement(this.$el.find('#add-static-box')).render();
            this.addPropertyBox.on('submit', this.createStaticFunction);

            return this;
        },

        setupAce: function () {
            this.model.get('functions').each(function (methodModel) {
                this.setupSingleAce(methodModel);
            }, this);

            // this.editor.getSession().setMode("ace/mode/css");
            // this.editor.setValue(this.model.get('basecss'), -1);
            // this.editor.on("change", this.keyup);
        },

        setupSingleAce: function (methodModel) {
            /* pass true as second argument to render this as a model_method from some plugin */
            /* this breaks when this.el is not rendered */
            var self = this;

            console.log($("#func-editor-" + methodModel.cid));
            var editor = ace.edit("func-editor-" + methodModel.cid);
            editor.getSession().setMode("ace/mode/javascript");
            editor.setValue(methodModel.getCode(), -1);

            if (methodModel.isGenerator()) {
                console.log('setting read only');
                editor.setReadOnly(true);
            } else {
                editor.on("change", function () {
                    self.codeChanged(methodModel, editor.getValue());
                });
            }
        },

        renderStaticMethod: function (methodModel) {
            var methodObj = methodModel.getGenerated();
            this.list.innerHTML += _.template(funcTemplate, {
                name: methodObj.name,
                cid: methodModel.cid
            });
            var el = $(this.list).find('.func-type-container').last();
            var fcv = new FuncChooserView(el, methodModel);
            fcv.render();
            try {
                this.setupSingleAce(methodModel);
            } catch (e) {
                console.log('didnt set up ace because of the cardview');
            }
        },

        clickedSettings: function (e) {
            var cid = e.currentTarget.id.replace('func-settings-', '');
            var methodModel = this.model.get('functions').get(cid);
            new WidgetSettingsView(methodModel).render();
        },

        removeMethod: function (methodModel) {
            this.$el.find('#func-chunk-', methodModel.cid).remove();
        },

        createStaticFunction: function (functionName) {
            this.model.get('functions').add(new NodeModelMethodModel({
                name: functionName,
                code: ''
            }));
        },

        codeChanged: function (methodModel, newValue) {
            methodModel.set('code', newValue);
        }

    });

    exports.NodeModelCodeView = NodeModelCodeView;

});

require.define("/AppInfoView.js",function(require,module,exports,__dirname,__filename,process,global){    'use strict';

    var ErrorDialogueView = require('./mixins/ErrorDialogueView');

    var app_info_view_temp = [
        '<div class="span40 domains w-pane pb2 hoff4" id="domain-settings">',
        '<h3 class="span36 offset2 hoff1">Domain Settings</h3>',
        '<hr class="span40">',
        '<div class="span36 offset2 hi5 hoff1">',
        '<h4>Current subdomain:</h4>',
        '<div><a href="{{ app.url }}" target="_blank">{{ app.hostname }}</a></div>',
        '</div>',
        '<hr class="span40">',
        '<div class="span36 offset2 hi5 hoff1">',
        '<h4>Change subdomain</h4>',
        '<form class="register-subdomain-form hi7">',
        '<p class="span18"><input type="text" class="span10 register-subdomain-input" placeholder="Your subdomain"/>',
        '<span style="line-height:50px">.appcubator.com</span></p>',
        '<a class="register-subdomain-button btn span13" style="display:none;">Claim subdomain</a>',
        '</form>',
        '</div>',
        '</div>',

        '<div class="w-pane span40 hoff4 pb2" id="danger-zone">',
        '<h3 class="span36 offset2 hoff1">Danger Zone</h3>',
        '<hr class="span40">',
        '<a class="btn btn-danger hoff1 span8 offset2" id="delete">Delete App</a>',
        '</div>'
    ].join('\n');


    var AppInfoView = Backbone.View.extend({

        events: {
            'click #delete': 'deleteApp',
            'keyup #app-name': 'changeName',
            'keyup #app-keywords': 'changeKeywords',
            'keyup #app-description': 'changeDescription',

            'keyup .register-subdomain-input': 'checkForSubDomain',
            'click #register-new-subdomain': 'showSubDomainRegistrationForm',
            'click .register-subdomain-button': 'registerSubDomain',
            'submit .register-subdomain-form': 'cancelFormSubmission',

            'keyup .register-domain-input': 'checkForDomain',
            'click #register-new-domain': 'showDomainRegistrationForm',
            'click .register-domain-button': 'registerDomain',
            'submit .register-domain-form': 'cancelFormSubmission'
        },

        initialize: function () {
            _.bindAll(this);

            this.model = v1State.get('info');
            this.title = "Domain & SEO";
            this.striper = new Striper();
        },

        render: function () {
            var page_context = {};
            page_context.name = this.model.get('name');
            page_context.keywords = this.model.get('keywords');
            page_context.description = this.model.get('description');

            this.el.innerHTML = _.template(app_info_view_temp, page_context);

            this.$nav = $('.navigator .left-nav');

            // make left nav links scroll page
            this.$nav.find('a').click(function () {
                var elem = this.getAttribute('href');
                var topPos = $(elem).offset().top - 75;
                $('html,body').animate({
                    scrollTop: topPos
                });
                return false;
            });
            this.$nav.find('li').click(function () {
                this.children[0].click();
            });

            $('.left-nav').affix({
                offset: 150
            });
            return this;
        },

        changeName: function (e) {
            this.model.set('name', e.target.value);
            util.askBeforeLeave();
        },

        changeKeywords: function (e) {
            this.model.set('keywords', e.target.value);
            util.askBeforeLeave();
        },

        changeDescription: function (e) {
            this.model.set('description', e.target.value);
            util.askBeforeLeave();
        },

        deleteApp: function () {
            var r = confirm("Are you sure you want to delete this App?");
            if (r === true) {
                $.ajax({
                    type: "POST",
                    url: '/app/' + appId + '/delete/',
                    complete: function () {
                        var url = '/app/';
                        window.location.href = url;
                    },
                    dataType: "JSON"
                });
            } else {
                return false;
            }
        },

        showDomainRegistrationForm: function (e) {
            $(e.target).hide();
            this.$el.find('.register-domain-form').fadeIn();
            this.$el.find('.register-domain-input').focus();
        },

        registerDomain: function (e) {
            alert('register');
        },

        registerSubDomain: function (e) {
            var subdomain = $('.register-subdomain-input').val();
            $.ajax({
                type: "POST",
                url: '/app/' + appId + '/subdomain/' + subdomain + '/',
                data: {},
                success: function (d) {
                    location.reload(true);
                },
                error: function (xhr) {
                    util.stopAjaxLoading();
                    console.log(JSON.parse(xhr.responseText).errors.replace("\n", '\n'));
                    alert("error: see logs");
                }
            });
            util.startAjaxLoading();
        },

        showSubDomainRegistrationForm: function (e) {
            $(e.target).hide();
            this.$el.find('.register-subdomain-form').fadeIn();
            this.$el.find('.register-subdomain-input').focus();
        },

        checkForDomain: function (e) {
            var name = $('.register-domain-input').val();

            $.ajax({
                type: "POST",
                url: '/domains/' + name + '/available_check/',
                success: function (domainIsAvailable) {
                    if (domainIsAvailable) {
                        $('.register-domain-input').removeClass('not-available');
                        $('.register-domain-input').addClass('available');
                        $('.register-domain-button').fadeIn();
                    } else {
                        $('.register-domain-input').removeClass('available');
                        $('.register-domain-input').addClass('not-available');
                        $('.register-domain-button').hide();
                    }
                },
                error: function (resp) {
                    new ErrorDialogueView({
                        text: "There seems to be a problem with the server. Please refresh the page and try again."
                    });
                },
                dataType: "JSON"
            });
        },

        checkForSubDomain: function (e) {
            var name = $('.register-subdomain-input').val();

            $.ajax({
                type: "POST",
                url: '/subdomains/' + name + '/available_check/',
                success: function (domainIsAvailable) {
                    if (domainIsAvailable) {
                        $('.register-subdomain-input').removeClass('not-available');
                        $('.register-subdomain-input').addClass('available');
                        $('.register-subdomain-button').fadeIn();
                    } else {
                        $('.register-subdomain-input').removeClass('available');
                        $('.register-subdomain-input').addClass('not-available');
                        $('.register-subdomain-button').hide();
                    }
                },
                error: function (resp) {
                    new ErrorDialogueView({
                        text: "There seems to be a problem with the server. Please refresh the page and try again."
                    });
                },
                dataType: "JSON"
            });
        },

        cancelFormSubmission: function (e) {
            e.preventDefault();
        }
    });

    exports.AppInfoView = AppInfoView;

});

require.define("/pages/PagesView.js",function(require,module,exports,__dirname,__filename,process,global){    var RouteModel = require('../models/RouteModel').RouteModel;
    // 'models/UrlModel',
    // 'collections/RouteCollection',
    // 'app/pages/PageView',
    // 'mixins/ErrorDialogueView',
    // 'mixins/BackboneNameBox',


    var PagesView = Backbone.View.extend({

        el: document.body,
        css: 'pages',
        subviews: [],

        events: {
            'click #clone-page-box': 'showCloneBox',
            'change #pages-list-clone': 'clonePageName',
            'submit .clone-name-form': 'clonePage'
        },

        initialize: function () {
            _.bindAll(this);

            this.collection = v1State.get('pages');
            this.listenTo(this.collection, 'add', function (model) {
                this.appendPage(model, false);
            });

            this.title = "Pages";
        },

        render: function () {
            this.$el.html(_.template(util.getHTML('pages-page'), {}));
            this.listView = document.getElementById('list-pages');

            if (this.collection.length === 0) {

            } else {
                this.collection.each(function (model) {
                    this.appendPage(model, false);
                }, this);
            }

            var createBox = new Backbone.NameBox({
                el: document.getElementById('create-page-box')
            });
            this.subviews.push(createBox);
            createBox.on('submit', this.createPage);

            $("#list-pages").sortable({
                cancel: "select"
            });
        },

        renderAddMobile: function () {
            //this.$el.append('<div class="add-mobile-section pane span40 offset10 hi6"><span class="mw mobile-image"></span><span>Add Mobile Functionality</span></div>');
        },

        renderAddWeb: function () {
            //this.$el.append('<div class="add-web-section pane span40 offset10 hi6"><span class="mw web-image"></span><span>Add Web Functionality</span></div>');
        },

        createPage: function (name, b) {
            var pageM = this.collection.push({
                name: name,
            });
            pageM.setupUrl(name);

            v1.save();
        },

        createMobilePage: function (name, b) {
            var pageUrlPart = name.replace(' ', '_');
            var pageUrl = {
                urlparts: [pageUrlPart]
            };

            if (!v1State.get('mobilePages').isUnique(name)) {
                new ErrorDialogueView({
                    text: 'Page name should be unique.'
                });
                return;
            }
            this.mobileCollection.add({
                name: name,
                url: pageUrl,
                navbar: {
                    brandName: v1State.get('name'),
                    links: [{
                        "url": "internal://Homepage",
                        "title": "Homepage"
                    }]
                }
            });

            v1.save();
        },

        appendPage: function (model, isMobile) {
            if (!isMobile) {
                var ind = _.indexOf(this.collection.models, model);
                var pageView = new PageView(model, ind, false);
                this.listView.appendChild(pageView.render().el);
                this.subviews.push(pageView);
            } else {
                var ind = _.indexOf(this.mobileCollection.models, model);
                var mobilePageView = new PageView(model, ind, true);
                this.mobileListView.appendChild(mobilePageView.render().el);
                this.subviews.push(mobilePageView);
            }
        },

        showCloneBox: function () {
            var list = document.getElementById('pages-list-clone');
            list.innerHTML = '';
            v1State.get('pages').each(function (pageM) {
                var liEl = document.createElement('option');
                liEl.value = 'clone-page-' + pageM.cid;
                liEl.innerHTML = pageM.get('name');
                list.appendChild(liEl);
            });

            this.$el.find('.box-button-clone').hide();
            this.$el.find('.clone-options').fadeIn();
        },

        clonePageName: function (e) {
            //this.$el.find('.box-button-clone').fadeIn();
            var el = document.getElementById('pages-list-clone');
            this.pageCidToClone = el.value.replace('clone-page-', '');
            this.$el.find('.clone-options').hide();
            this.$el.find('.clone-name-form').fadeIn();
            $('.clone-page-name').focus();
        },

        clonePage: function (e) {
            e.preventDefault();

            var pageM = v1State.get('pages').get(this.pageCidToClone);
            var pageName = $('.clone-page-name').val();

            var initModel = pageM.serialize();
            var pageUrlPart = pageName.replace(/ /g, '_');
            initModel.url.urlparts[0] = pageUrlPart;
            initModel.name = pageName;
            initModel = new PageModel(initModel);

            this.collection.add(initModel);

            this.$el.find('.clone-name-form').hide();
            this.$el.find('.box-button-clone').fadeIn();
            $('.clone-page-name').val('');
        },

        close: function () {
            $("#list-pages").sortable("destroy");
            PagesView.__super__.close.call(this);
        }

    });

    exports.PagesView = PagesView;

});

require.define("/main.js",function(require,module,exports,__dirname,__filename,process,global){var Generator = require('./Generator').Generator;
var AppModel = require('./models/AppModel').AppModel;
var RouteCollection = require('./collections/RouteCollection').RouteCollection;
var ThemeModel = require('./models/ThemeModel').ThemeModel;
var KeyDispatcher = require('./template_editor/KeyDispatcher').KeyDispatcher;
var MouseDispatcher = require('./template_editor/MouseDispatcher').MouseDispatcher;

var AppRouter = require('./AppRouter').AppRouter;

if (window) {

    window.onerror = function () {
        //alert("I\'m a bug, please squash me.");
    }

    if (!appState) throw "No appstate";


    /* Initialize v1State */
    window.v1State = new Backbone.Model();
    /* Global code generator for this app. */
    window.G = new Generator(function () {
        return v1State.serialize().plugins;
    });
    v1State = new AppModel(appState);
    v1State.set('routes', new RouteCollection(appState.routes || []));

    /* Initialize v1UIEState */
    v1UIEState = new ThemeModel(uieState);

    /* Help with debugging */
    v1State.on('error', function (message) {
        alert(message);
    });

    /* Track key/mouse events */
    g_guides = {};
    keyDispatcher = new KeyDispatcher();
    mouseDispatcher = new MouseDispatcher();


    v1 = {};
    v1 = new AppRouter();
    v1.appmain(0, 0);
    // Backbone.history.start({
    //     pushState: true
    // });

    // handle all click events for routing
    $(document).on('click', 'a[rel!="external"]', function (e) {
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

