/**
 *
 * SDK for  vk.com API
 *
 * @author 57uff3r@gmail.com
 * @see https://github.com/57uff3r/nodejs-vksdk
 * @see http://57uff3r.ru
 */
var    util           = require('util');
        EventEmitter    = require('events').EventEmitter,
        crypto          = require('crypto'),
        http            = require('http'),
        https          = require('https');

/**
 * Create new SDK object
 * @param {object} _options
 *  - mode  - auth mode (oauth or sig)
 *  - appID -
 * @returns {undefined}
 */
var VK = function(_options) {
    var self = this;

    // appID, appSecret, mode (sig, oauth), [version], [language]
    self.options        = _options;

    // Default settings
    self.default = {
      version: '3.0',
      language: 'ru'
    };

    /**
     * APi method request
     * @param {string} _method APi method name
     * @param {mixed} _requestParams object or null (or undef), API method params
     * @param {mixed} _response string, function or null (or undef), callback function or custom event name
     * @param {string} _responseType define type of response callback or event
     * @returns {undefined}
     */
    self.request = function(_method, _requestParams, _response) {
        var responseType = 'event';

        if ( typeof(_response) === 'function') {
            responseType = 'callback';
        }

        if (self.options.mode === 'sig') {
            self._sigRequest(_method, _requestParams, _response, responseType);
        } else if (self.options.mode === 'oauth') {
            self._oauthRequest(_method, _requestParams, _response, responseType);
        } else {
            throw 'nodejs-vk-sdk: you have to specify sdk work mode (sig or oauth) before requests.';
        }
    };

    /**
     * Change SDK request mode
     * @param {string} _mode sig or outh
     * @returns {undefined}
     */
    self.changeMode = function(_mode) {
        self.mode = _mode;
    };

    /**
     * Update oauth token
     * @param {mixed} _param
     *     empty  - for server-side api requests
     *     { code : string }  - obtain token with code
     *     { token : string } - setup token manually
     * @returns {undefined}
     */
    self.setToken = function(_param) {
        if (typeof(_param) === 'object') {
            if (_param.token) {
                self.token = _param.token;
            } else if (_param.code) {
                self._setUpTokenByCode(_param.code);
            }
        } else {
            self._setUpAppServerToken();
        }
    };

    /**
     * Get current token
     * @returns {string}
     */
    self.getToken = function() {
        return self.token;
    };

    /**
     * Get current user id
     * @returns {number}
     */
    self.getUserId = function() {
      return self.userId;
    }

    /**
     * Get expires in
     * @returns {number}
     */
    self.getExpiresIn = function() {
      return self.expiresIn;
    }


    /**
     * Get token by login and password
     *
     * @param {string} _username vk user username
     * @param {string} _password vk user password
     * @returns {undefined}
     *
     * @see https://vk.com/dev/auth_direct
     */
    self.acquireToken = function(_username, _password) {
        var path = '/access_token?' + self._buildQuery({
                "client_id": self.options.appID,
                "client_secret": self.options.appSecret,
                'redirect_uri': "undefined" === typeof self.options.redirectUri ? undefined : self.options.redirectUri,
                'grant_type': 'password',
                'scope': 'notify,friends,photos,audio,video,docs,messages,notifications,offline,wall',
                'username': _username,
                'password': _password
        });

        var options = {
            host: 'oauth.vk.com',
            port: 443,
            path: path
        };
        https.get(options, function(res) {
            var apiResponse = new String();
            res.setEncoding('utf8');
            res.on('data', function(chunk) {
                apiResponse += chunk;
            });
            res.on('end', function() {
                var o = JSON.parse(apiResponse);
                if (!o.access_token) {
                    self.emit('acquireTokenNotReady', o);
                } else {
                    self.token = o.access_token;
                    self.emit('acquireTokenReady');
                }
            });
        }).on('error', function (e) {
            self.emit('error', e);
        });
    };

    /**
     * Obtain token with code
     * @param {string} _code
     * @returns {undefined}
     */
    self._setUpTokenByCode = function(_code) {
        var path = '/access_token?' + self._buildQuery({
                "client_id": self.options.appID,
                "client_secret": self.options.appSecret,
                "code": _code,
                'redirect_uri': "undefined" === typeof self.options.redirectUri ? undefined : self.options.redirectUri
        });

        var options = {
            host: 'oauth.vk.com',
            port: 443,
            path: path
        };

        https.get(options, function(res) {

            var apiResponse = new String();
            res.setEncoding('utf8');

            res.on('data', function(chunk) {
                apiResponse += chunk;
            });

            res.on('end', function() {
                var o = JSON.parse(apiResponse);
                if (!o.access_token) {
                  self.emit('tokenByCodeNotReady', o);
                } else {
                    self.token = o.access_token;
                    self.userId = o.user_id;
                    self.expiresIn = o.expires_in;
                    self.emit('tokenByCodeReady');
                }
            });

        }).on('error', function (e) {
            self.emit('error', e);
        });
    };

    /**
     * Obtain server-side token
     * @returns {undefined}
     */
    self._setUpAppServerToken = function() {
        var path = '/oauth/access_token?' + self._buildQuery({
                "client_id": self.options.appID,
                "client_secret": self.options.appSecret,
                "grant_type": "client_credentials"
        });

        var options = {
            host: 'api.vk.com',
            port: 443,
            path: path
        };
        https.get(options, function(res) {

            var apiResponse = new String();
            res.setEncoding('utf8');

            res.on('data', function(chunk) {
                apiResponse += chunk;
            });

            res.on('end', function() {
                var o = JSON.parse(apiResponse);
                if (o.error) { self.emit('appServerTokenNotReady', o);

                } else {
                    self.token = o.access_token;
                    self.emit('appServerTokenReady');
                }
            });

        }).on('error', function (e) {
            self.emit('error', e);
        });
    };

    /**
     * Outh api request
     * @param {string} _method
     * @param {mixed} _params
     * @param {mixed} _response
     * @param {string} _responseType
     * @returns {undefined}
     */
    self._oauthRequest = function(_method, _params, _response, _responseType) {
        var params = (!!_params ? _params : {});
        params["access_token"] = self.token;
        params['v'] = self.options.version || self.default.version;
        params['lang'] = self.options.language || self.default.language;

        if("undefined" !== typeof _params) {
          params['v'] = _params['v'] || params['v'];
          params['lang'] = _params['lang'] || params['lang'];
        }

        var path = '/method/' + _method + '?' + self._buildQuery(params);

        var options = {
            host: 'api.vk.com',
            port: 443,
            path: path
        };

        https.get(options, function(res) {
            var apiResponse = new String();
            res.setEncoding('utf8');

            res.on('data', function(chunk) {
                apiResponse += chunk;
            });

            res.on('end', function() {
                var o = JSON.parse(apiResponse);
                if (_responseType === 'callback' && typeof _response === 'function') {
                    _response(o);
                } else {
                    if (!_response) self.emit('done:' + _method, o);
                    else self.emit(_response, o);
                }
            });

        }).on('error', function (e) {
            self.emit('error', e);
        });
    };

    /**
     * Request API method with signature
     * @param {string} _method
     * @param {mixed} _params
     * @param {mixed} _response
     * @param {string} _responseType
     * @returns {undefined}
     */
    self._sigRequest = function(_method, _params, _response, _responseType) {

        var params              = (!!_params ? _params : {});
        params.api_id          = self.options.appID;
        params.v                = ('v' in params) ? params['v'] : self.options.version || self.default.version;
        params.lang            = ('lang' in params) ? params['lang'] :  self.options.language ||  self.default.language,
        params.method          = _method;
        params.timestamp        = new Date().getTime();
        params.format          = 'json';
        params.random          = Math.floor(Math.random() * 9999);

        params  = this._sortObjectByKey(params);
        var sig = '';
        for(var key in params) {
            sig = sig + key + '=' + params[key];
        }
        sig            = sig + self.options.appSecret;
        params.sig      = crypto.createHash('md5').update(sig, 'utf8').digest('hex');

        var requestString = self._buildQuery(params);

        var options = {
            host: 'api.vk.com',
            port: 80,
            path: '/api.php?' + requestString
        };
        http.get(options, function(res) {
            var apiResponse = new String();
            res.setEncoding('utf8');

            res.on('data', function(chunk) {
                apiResponse += chunk;
            });

            res.on('end', function() {
                var o = JSON.parse(apiResponse);
                if (_responseType === 'callback' && typeof _response === 'function') {
                    _response(o);
                } else {
                    if (!_response) self.emit('done:' + _method, o);
                    else self.emit(_response, o);
                }
            });
        }).on('error', function (e) {
            self.emit('error', e);
        });

    };

    /**
     * Implode array to string
     * @param {string} glue
     * @param {array} pieces
     * @returns {@exp;pieces@call;join|@exp;@exp;pieces@call;joinpieces|VK.implode.pieces}
     */
    self._implode = function implode( glue, pieces ) {
        return ( ( pieces instanceof Array ) ? pieces.join ( glue ) : pieces );
    };

    /**
     * Sort object properties by name
     * @param {object} o
     * @returns {object}
     */
    self._sortObjectByKey = function (o) {
        var sorted = {},
        key, a = [];

        for (key in o) {
            if (o.hasOwnProperty(key)) {
                a.push(key);
            }
        }

        a.sort();

        for (var key = 0; key < a.length; key++) {
            sorted[a[key]] = o[a[key]];
        }
        return sorted;
    };

    /**
     * Generate URL-encoded query string
     * @param  {object} params
     * @return {string}
     */
    self._buildQuery = function(params) {
        var arr = [];
        for(var name in params) {
            var value = params[name];

            if("undefined" !== typeof value) {
              arr.push( name+'='+ encodeURIComponent(value) );
            }
        }

        return self._implode('&', arr);
    }

};

util.inherits(VK, EventEmitter);
module.exports = VK;