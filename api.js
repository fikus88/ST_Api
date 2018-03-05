var express = require('express');
var Sequelize = require('sequelize');
var app = express();
var fs = require('fs');
var request = require('request');
var cron_cont = require('cron').CronJob;
var cron_once = require('cron').CronJob;
var nodemailer = require('nodemailer');
var transport = require('nodemailer-smtp-transport');
var morgan = require('morgan');
var bodyParser = require('body-parser');
var cors = require('cors');
var _Sens = require('./Sensitive')
var requests = require('./requests');

app.use(morgan('dev'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(cors());
var jwt = require('jsonwebtoken'); // used to create, sign, and verify tokens



var apiRoutes = express.Router();


// route middleware to verify a token
apiRoutes.use(function(req, res, next) {

    // check header or url parameters or post parameters for token
    var token = req.body.token || req.query.token || req.headers['x-access-token'];

    // decode token
    if (token != null) {
        console.log(token);
        // verifies secret and checks exp

        if (token != _Sens.APISecret) {

            return res.status(401).send({
                success: false,
                message: 'Token not authorized'
            });
        } else {

            next();
        }

    } else {

        // if there is no token
        // return an error
        return res.status(403).send({
            success: false,
            message: 'No token provided.'
        });

    }
});

// apply the routes to our application with the prefix /api
app.use('/serial-api', apiRoutes);


// create reusable transporter object using the default SMTP transport
var transporter = nodemailer.createTransport(transport({
    service: 'Gmail',
    auth: {
        user: 'fikus88@gmail.com',
        pass: _Sens.GMAILPass
    }
}));

// setup e-mail data with unicode symbols



var Titles = [];
var ep;

function SendEmail(type, Titles) {
    var chosen_opts;
    if (type == 'Success') {


        chosen_opts = {
            from: '"Serial Tracker Admin" <fikus88@gmail.com>', // sender address
            to: 'fikus88@gmail.com', // list of receivers
            subject: 'Update Success', // Subject line
            html: '<b>Hello, Its Serial Tracker</b><div><p>Your serials have been updated</p></div><div><ul>'
        };
        for (var i in Titles) {
            if (Titles[i] != 'EXISTS') {
                chosen_opts.html += '<li>' + Titles[i] + '</li>'


            }
        }

        if (chosen_opts.html.indexOf('<li>') == -1) {
            chosen_opts.html = '<b>Hello, Its Serial Tracker</b><div><p>Sorry, none of your serials have been recently updated.</p></div><div><ul>'
        }
        chosen_opts.html += '</ul></div>'
    } else {

        chosen_opts = {
            from: '"Serial Tracker Admin" <fikus88@gmail.com>',
            to: 'fikus88@gmail.com',
            subject: 'Update Failed',
            html: '<h1 style="color:red">UPDATE FAILED</h1><div><ul>'
        };


    }

    // send mail with defined transport object
    transporter.sendMail(chosen_opts, function(error, info) {
        if (error) {
            return console.log(error);
        }
        console.log('Message sent: ' + info.response);
    });

}

/*
new cron_once('* * * * * *',function() {
GetAllIDs();
this.stop();
},null,true);
*/
new cron_cont('0 0 */12 * * *', function() {

    GetAllIDs();

}, null, true);

var seq = _Sens.seq; // sequelize conn


//Check Status

app.get('/serial-api', function(req, res) {
    res.send('<h1 style="color:red;">API CONNECTED</h1>');
});




// Save single serial in db  by id

app.get('/serial-api/serial/:id', function(req, res) {
    var id = req.params.id;
    ID = id;
    var req_string = 'http://api.tvmaze.com/shows/' + id;
    request(req_string, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var obj = JSON.parse(body);

            if (obj.image != null) {
                var images_str = JSON.stringify(obj.image);
                var images = JSON.parse(images_str);

            } else {
                images.original = 'http://blogs.diabetes.org.uk/wp-content/themes/white/assets/images/placeholder.jpg';
            };
            if (obj.summary != null) {
                obj.summary = obj.summary.split("'").join("");
            };
            SaveSerial("'" + obj.name.replace("'", "") + "'", "'" + images.original + "'", "'" + obj.summary + "'", id);
            res.send("Serial " + obj.name + " successfully added to database.");

        }
    });
});



// STORE SERIAL IN DB

function SaveSerial(title, poster, summary, api_id) {

    seq.query('SELECT fn_show_upsert(' + title + ',' + poster + ',' + summary + ',' + api_id + ')').then(function(projects) {
        return projects;
    })

}


function SaveEpisode(serial_id, ep_title, ep_poster, season, episode, ep_summary, air_time) {
    var query = 'SELECT fn_episodes_upsert(' + serial_id + ',' + ep_title + ',' + ep_poster + ',' + season +
        ',' + episode + ',' + ep_summary + ',' + air_time + ')';
    seq.query(query, { type: seq.QueryTypes.SELECT }).then(function(ep) {
        var episode = JSON.parse(JSON.stringify(ep));
        console.log(episode[0].fn_episodes_upsert);

        Titles.push(episode[0].fn_episodes_upsert);


    })
}

// UPDATE ALL EPISODES FOR SERIALS

function GetAllIDs() {

    var query = "SELECT api_id from serials";
    seq.query(query, { type: seq.QueryTypes.SELECT }).then(function(results) {
        // console.log(results);
        var obj = JSON.parse(JSON.stringify(results));
        //console.log(obj);
        Titles = [];
        for (var i in obj) {

            GetAllEpisodes(obj[i].api_id); // UNCOMMENT UPDATE PROCESS

        };

    });
    if (Titles.length > 0) {
        SendEmail("Success", Titles);
    } else {
        SendEmail("Fail", Titles);
    }

}

//GET FULL LIST OF EPISODES FOR GIVEN ID AND STORE THEM IN DB
function GetAllEpisodes(id) {


    var req_string = 'http://api.tvmaze.com/shows/' + id + '/episodes';
    request(req_string, function(error, response, body) {
        if (!error && response.statusCode == 200) {

            var obj = JSON.parse(body);
            for (var i in obj) {

                if (obj[i].image != null) {
                    var images_str = JSON.stringify(obj[i].image);
                    var images = JSON.parse(images_str);

                } else {
                    images = { original: 'http://blogs.diabetes.org.uk/wp-content/themes/white/assets/images/placeholder.jpg' };

                }
                var dt = "";
                if (obj[i].airdate != "") {
                    dt = obj[i].airdate + " " + obj[i].airtime + ":00";

                } else {
                    dt = "";
                }
                //var dt = new Date(dtt.split("-").reverse().join("-")).getTime();

                if (obj[i].summary != null && dt != '') {
                    obj[i].summary = obj[i].summary.split("'").join("");

                    SaveEpisode(id, "'" + obj[i].name.replace("'", "") + "'", "'" + images.original + "'",
                        obj[i].season, obj[i].number, "'" + obj[i].summary + "'", "'" + dt + "'")
                };
            }

        }
    })

}

app.get('/serial-api/eps/:id', function(req, res) {
    var id = req.params.id;
    GetAllEpisodes(id);
    res.send('Episodes added');
});


// LOGGED USER CALLS

app.use('/serial-api/logged', requests);



var server = app.listen(8080, function() {
    var host = server.address().address;
    var port = server.address().port;
    console.log("API Runing at http://%s:%s", host, port)
});