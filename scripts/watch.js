  var child, cmd, path, spawn, watchr;

  watchr = require("watchr");

  spawn = require("child_process").spawn;

  path = process.argv[2];

  cmd = process.argv[3];

  child = null;

  console.log("Path: " + path);

  console.log("Command: " + cmd);

  watchr.watch({
    paths: [path],
    listeners: {
      error: function(err) {
        return console.log("an error occured:", err);
      },
      change: function(changeType, filePath) {
        //if (filePath.indexOf(".coffee") > -1) {
          console.log("Running '" + cmd + " " + (process.argv.slice(4).join(" ")) + "'");
          if (child != null) {
            child.kill();
          }
          child = spawn(cmd, process.argv.slice(4));
          child.stdout.on("data", function(data) {
            return process.stdout.write(Buffer(data).toString("utf8"));
          });
          child.stdout.on("error", function(data) {
            return process.stderr.write(Buffer(data).toString("utf8"));
          });
          child.stderr.on("data", function(data) {
            return process.stdout.write(Buffer(data).toString("utf8"));
          });
          return child.stderr.on("error", function(data) {
            return process.stderr.write(Buffer(data).toString("utf8"));
          });
        //}
      }
    }
  });