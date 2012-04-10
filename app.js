var express = require('express')
  , bcrypt = require('bcrypt')
  , crypto = require('crypto')
  , mysql = require('mysql')
  , nowjs = require('now')
  , config = require('./config')
  , app = express.createServer()
  , store = new express.session.MemoryStore();

var client = mysql.createClient(config.database);

var md5sum = crypto.createHash('md5');

process.on('uncaughtException', function(err) {
  return console.log('Caught exception: ' + err);
});

app.configure(function() {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.static(__dirname + '/public'));
  app.use(express.errorHandler({
    dumpExceptions: true,
    showStack: true
  }));
  app.use(express.logger());
  app.use(express.cookieParser());
  app.use(express.session({
    store: store,
    secret: config.session.secret,
    key: config.session.key
  }));
});

var everyone = nowjs.initialize(app);

var loggedIn = function(req, res) {
  return (typeof req.session.user_id !== undefined && req.session.user_id != null);
};

var loginRequired = function(req, res, callback) {
  if (loggedIn(req)) {
    callback();
  } else {
    res.redirect('/login');
  }
};

app.dynamicHelpers({
  session: function(req, res) {
    return req.session;
  },
  loggedIn: loggedIn
});

app.get('/', function(req, res) {
  if (loggedIn(req)) {
    client.query('SELECT `rooms`.`name`, `rooms`.`slug`, `users`.`name` AS `user_name`, `users`.`id` AS `user_id` FROM `rooms` ' +
                 'INNER JOIN `rooms_users` ON `rooms`.`id` = `rooms_users`.`room_id` ' +
                 'INNER JOIN `users` ON `rooms_users`.`user_id` = `users`.`id` ',
                 function(err, results, fields) {
      if (err) {
        throw err;
      }
      res.render('index', { rooms: results });
    });
  } else {
    res.render('index');
  }
});

app.get('/signup', function(req, res) {
  res.render('signup');
});

app.get('/login', function(req, res) {
  res.render('login');
});

app.get('/logout', function(req, res) {
  req.session.destroy();
  res.redirect('/');
});

app.post('/signup', function(req, res) {
  bcrypt.genSalt(10, function(err, salt) {
    bcrypt.hash(req.body.password, salt, function(err, hash) {
      client.query('INSERT INTO `users` (`name`, `username`, `email`, `password_digest`) VALUES (?, ?, ?, ?)',
        [req.body.name, req.body.username, req.body.email, hash],
        function(err, info) {
          if (err) {
            throw err;
          } else {
            req.session.user_id = info.insertId;
            req.session.user_name = req.body.name;
          }
          res.redirect('/');
        }
      );
    });
  });
});

app.post('/login', function(req, res) {
  client.query('SELECT `id`, `password_digest`, `name` FROM `users` WHERE `username` = ? LIMIT 1', [req.body.username], function(err, results, fields) {
    if (err) {
      throw err;
    }
    if (results.length > 0) { // username exists
      bcrypt.compare(req.body.password, results[0].password_digest, function(err, match) {
        if (match) { // correct username and password
          req.session.user_id = results[0].id;
          req.session.user_name = results[0].name;
          console.log('Login successful!');
          res.redirect('/');
        } else { // bad password
          console.log('Login failed -- bad password');
          res.redirect('/login');
        }
      });
    } else { // username doesn't exist
      console.log("Login failed -- user doesn't exist");
      res.redirect('/');
    }
  });
});

app.get('/rooms/new', function(req, res) {
  loginRequired(req, res, function() {
    res.render('new_room.jade');
  });
});

app.post('/rooms/create', function(req, res) {
  loginRequired(req, res, function() {
    var slug = req.body.name.replace(/\s+/g,'-').replace(/[^\w\d-]+/g,'').toLowerCase()
      , uid = md5sum.update(''+ req.body.name + (new Date()).getTime() + 'rick santorum').digest('hex');
    client.query('INSERT INTO `rooms` (`name`, `slug`, `uid`) VALUES (?, ?, ?)', [req.body.name, slug, uid], function(err, info) {
      // TODO: error handling
      client.query('INSERT INTO `rooms_users` (`room_id`, `user_id`) VALUES (?, ?)', [info.insertId, req.session.user_id]);
    });
    res.redirect('/rooms/'+slug);
  });
});

app.get('/rooms/:slug', function(req, res) {
  loginRequired(req, res, function() {
    client.query('SELECT `id`, `name`, `uid` FROM `rooms` WHERE `slug` = ? LIMIT 1', [req.params.slug], function(err, results, fields) {
      if (err) {
        throw err;
      }
      if (results.length > 0) { // room exists
        // TODO: check if user is allowed in room
        var room = results[0];
        req.session.room_id = room.id;
        res.render('room.jade', { room: room, layout: false });
      } else { // room doesn't exist
        // TODO: 404
        res.redirect('/');
      }
    });
  });
});

nowjs.on('connect', function() {
  var user = this.user;
  var sid = unescape(user.cookie["commonroom"]);
  store.get(sid, function(err, session) {
    if (err || !session) {
      throw err;
    }
    user.name = session.user_name;
    user.id = session.user_id;
    user.room = session.room_id;
    nowjs.getGroup(user.room).addUser(user.clientId);
    nowjs.getClient(user.clientId, function() {
      this.now.getHistory();
    });
  });
});

nowjs.on('disconnect', function() {
  console.log(this.user.name + ' disconnected from room ' + this.user.room);
});

everyone.now.getHistory = function(message) {
  if (!this.user.noHistory) {
    var user = this.user
      , lessThanIdCondition = user.earliestMessage ? 'AND `messages`.`id` < ? ' : ''
      , conditionArgs = user.earliestMessage ? [user.room, user.earliestMessage] : [user.room];
    nowjs.getClient(user.clientId, function() {
      var thisClient = this;
      client.query('SELECT `messages`.`id`, `messages`.`timestamp`, `messages`.`text`, `messages`.`user_id`, `users`.`name` FROM `messages` ' +
                   'LEFT JOIN `users` ON `users`.`id` = `messages`.`user_id` ' +
                   'WHERE `messages`.`room_id` = ? ' + lessThanIdCondition + 'ORDER BY `messages`.`id` DESC LIMIT 10',
                   conditionArgs, function(err, messages, fields) {
        if (err) {
          throw err;
        }
        if (messages.length > 0) {
          user.earliestMessage = messages[messages.length-1].id;
          thisClient.now.receiveHistory(messages);
        } else {
          thisClient.now.receiveHistory([]);
          user.noHistory = true;
        }
     });
   });
  }
};

everyone.now.distributeMessage = function(message) {
  var user = this.user;
  var timestamp = (new Date()).getTime();
  client.query('INSERT INTO `messages` (`room_id`, `user_id`, `text`, `timestamp`) VALUES (?, ?, ?, ?)',
    [user.room, user.id, message, timestamp],
    function(err, info) {
      if (err) {
        throw err;
      }
      nowjs.getGroup(user.room).now.receiveMessage(info.insertId, user.id, timestamp, user.name, message);
    }
  );
};

app.listen(config.web.port);
