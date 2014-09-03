Appcubator
==========

- Implementing web software should be easy.
- Allow extensibility with custom code
- Interop with existing community code
- Should be usable by people who don't have domain knowledge in Web dev 

Table of Contents
-----------------

1. What is an Appcubator app?
2. Concepts
    - Template
        - UI Element
    - Model
        - Fields
        - Methods
    - Route (or Page)

3. User Interface Code
4. Code Generation

What is an Appcubator app?
--------------------------

Concepts
--------

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

