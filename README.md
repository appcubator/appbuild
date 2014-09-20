Appcubator
==========

- Implementing web software should be easy.
- Allow extensibility with custom code
- Interop with existing community code
- Should be usable by people who don't have domain knowledge in Web dev 

Table of Contents
-----------------

A. What is an Appcubator App?
B. Appcubator Components
    1. Template
    2. UI Element
    3. Model
        a. Fields
        b. Methods
    4. Route (or Page)
C. Browser Interface
D. Deployment

What is an Appcubator App?
--------------------------

Short version

It starts out as a JSON of data which the user can modify using the browser interface.
Then the nodes of the JSON tree go through macro-expansion to generate code.
Then the code is written to disk, and shipped off to a server to be redeployed.

Long version

At the lowest level, an Appcubator app is an Express.js web server application,
which responds to HTTP requests to serve pages and respond to form submissions.
It also connects to a MongoDB instance to persist and retrieve data.

On a higher level, an Appcubator app can be thought of in terms of
Data Models, Pages (or Routes), and Templates.

On a higher level, each component of the app can be generated from user-inputted data,
using a "Generator".
A Generator is a javascript function which takes in data which the user provides, and turns it into an Appcubator component.

On a higher level, the components of an Appcubator app form a tree of data which can be represented as a JSON in the browser. This JSON tree is called the app-state.

Appcubator Components
---------------------
At the top level, we have the following keys:

* models
* templates
* routes
* css
* generators

Each section will be elaborated below.

models
------

A list of objects representing models, each of the following schema. Note that each model object will render into it's own model file <modelname.js> in the ./models directory.

**name**: This will become the identifier of the model, so make sure it's fit to be a proper Mongoose Model name.

**requires**: List of strings of packages/modules to require. Use the CommonJS naming standards. Mongoose comes by default, so don't bother including it.

**fields**: List of objects, each with the data for that field/key in the model.
See http://mongoosejs.com/docs/api.html#schema_Schema-add for addl. info on format of each object.

**instancemethods**: An object where the keys are the names of the instancemethods and the values should be the string representation of the anonymous functions that will be bound to the given name.
See http://mongoosejs.com/docs/api.html#schema_Schema-method to understand how the code is injected into the application.

**staticmethods**: An object where the keys are the names of the staticmethods and the values should be the string representation of the anonymous functions that will be bound to the given name.
See http://mongoosejs.com/docs/api.html#schema_Schema-static to understand how the code is injected into the application.

templates
---------
A list of objects each representing an ejs template. Each will turn into it's own EJS file and go in ./views. Each object has the following schema:

**name**: (The name of the template file. try to make this a sane filename and avoid spaces.)

**layoutStrategy**: (We currently only support "rowcol")

**uielements**: (A list of objects which each have at least **html**, **css**, and **js** keys. A layout key will probably exist but I'm not sure of the best way of going about this. Also thought about having row and column uielements and putting uielements in there to form a tree. @ican)

Note that if the layout strategy limits you in some way, you can add your own CSS in the **css** section below. But this will get messy after a while. Reserve this use case of css for desperately needed one-offs and exceptions. Better to define a new layoutStrategy if you're repeatedly writing layout css.

routes
------
A list of objects each representing a route. This will be injected serially into ./routes.js, so order matters. Each object has the following schema:

**method**: A string of the http method you want to use. Casing doesn't matter. 

**pattern**: The string of the pattern to match. Use the syntax describe here: http://expressjs.com/api.html#app.VERB Note we don't support regex yet. 

**code**: The string of the code of the anonymous function to handle the request. See the above link for syntax info.

TODO what will be imported into this file? <- hard question to answer

css
---
Some uiestate structure that will generate CSS in a straightforward way. @ican


generators
----------
Functions of the type (data -> (code as data)).
Generators allow developers to write highly "configurable" code.
These exist in order to allow a people to generate code from a visual interface.
The users enter data in a web UI, and the resulting app will have the code configured with that data.

Generators are named, versioned, and they can be organized by namespace.
The "code" key should be the source code for the function which will be passed an object containing templates, and an array of args. In the templates key, you can define templates to be passed to the function. This is just a convenience so you can separate code templates from logic code.

Example generator:

    generators: [{ namespace: "app.methods",
                   name: "create",
                   version: "0.0.1",
                   code: "function(templates, args) { return templates.create.render({ modelname: args[0]) }); }",
                   templates: { "create": "function (newData) { {{ modelname }}.new(newData); }"
                 }...]

Use a generator somewhere in the app:

    staticmethods: [{ generator: "app.methods.create-0.0.1",
                      data: ['Book']
                   }...]

And at compile time, it will be expanded into the proper code.


Old text that i dont know what to do with
------------

Your app is a JSON tree of macros which expand to code.
The generated apps are powered by Node.js and MongoDB.

The JSON tree, called the app state, has the following structure:

- models - database schema, functions for backend logic, and API endpoints
- templates - html templates for pages
- routes - url + logic that runs when you serve pages. also server side db or misc apis
- css - styling code for your pages. you can use prewritten themes to get started quickly

When you interact with the visual interface, you’re implicitly adding or configuring the code generators in these sections.
When you "publish", the app state is sent to the server where your app is hosted. There the code generators in each section are fully expanded to code and stored on disk.

TODO hosting

Full example:

    {
        "packages":{
            "express":"3.4.4",
            "flickr":"0.1.0"
        },
        "modules":{
            "custom.txt": "muahahah"
        },
        "models": [{ "name": "Picture",
                     "requires": ["flickr"],
                     "fields": {
                         "datePicked": "Date",
                         "url": "String"
                         },
                     "instancemethods": {
                         "updateUrl": "function(newUrl, cb) {this.url = newUrl;\nthis.save(function(e, d){cb(e,d)})}"
                         },
                     "staticmethods": {
                         "randomNFromFlickr": "function(searchQ, limit, cb) {var fcli = new flickr.Flickr('YOUR_CONSUMER_KEY/API_KEY', 'YOUR_CONSUMER_SECRET');\n fcli.executeAPIRequest('flickr.photos.search',{text: searchQ, per_page: limit}, false, function(e, d){cb(e, d)});}"
                         }
                     }],
        "templates": [{ "name":"Homepage",
                        "layoutStrategy":"rowcol",
                        "uielements": [{"html": "<h1>Hello World</h1>",
                                        "css": "/*hello css*/",
                                        "js": "// hello js"}]}],
        "routes": [{ "method": "GET",
                     "pattern": "/",
                     "code": "function (req, res) {\nres.render('Homepage.ejs');\n}"}],
        "css": {}
    }
