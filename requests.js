/**
 * Created by Lukasz on 10/05/2017.
 */
var express = require('express');
var request = require('request');
var router = express.Router();


//check status

router.get('', function(req, res) {
    res.send('<h1 style="color:red;">API LOGGED CONNECTED</h1>');
});


//SEARCH

router.get("/search",
    function (req, res) {
        var query = req.params.query;
        var searchPhrase = req.get('searchPhrase');
        var req_string = 'http://api.tvmaze.com/search/shows?q=' + searchPhrase;
        console.log(req_string);
        request(req_string, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                res.json(JSON.parse(body));

            }
        })
    });

module.exports = router;