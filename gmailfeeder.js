const Soup = imports.gi.Soup;

function GmailFeeder(data) {
  this.feedUrl = "https://mail.google.com/mail/feed/atom/";

  this.callbacks = {
    onError : undefined,
    onChecked : undefined
  };
  
  this.username = undefined;
  this.password = undefined;
  
  if (data != undefined){
    if (data.callbacks != undefined){
      this.callbacks.onError = data.callbacks.onError;
      this.callbacks.onChecked = data.callbacks.onChecked;
    }
    
    this.username = data.username;
    this.password = data.password;
  }
  
  var this_ = this;

  try {
    this.atomns = new Namespace('http://purl.org/atom/ns#');
  } catch (e) {
    throw 'GmailFeeder: Creating Namespace failed: '+e;
  }
  
  try {
    this.httpSession = new Soup.SessionAsync();
  } catch (e) {
    throw 'GmailFeeder: Creating SessionAsync failed: '+e;
  }
  
  try {
    Soup.Session.prototype.add_feature.call(this.httpSession, new Soup.ProxyResolverDefault());
  } catch (e) {
    throw 'GmailFeeder: Adding ProxyResolverDefault failed: ' + e;
  }
  
  try {
    this.httpSession.connect('authenticate', function(session, msg, auth, retrying, user_data) { 
        this_.onAuth(session, msg, auth, retrying, user_data); } );
  } catch (e) {
    throw 'GmailFeeder: Connecting to authenticate signal failed: ' + e;
  }
}

GmailFeeder.prototype.onAuth = function(session, msg, auth, retrying, user_data) {
  if (retrying) {
    if (this.callbacks.onError != undefined) {
      this.callbacks.onError("authFailed");
    }
    return;
  }
    
  auth.authenticate(this.username, this.password);
}

GmailFeeder.prototype.check = function() {
    let this_ = this;

    let message = Soup.Message.new('GET', this.feedUrl);
    this.httpSession.queue_message(message, function(session,message) { this_.onResponse(session, message) } );
}
  
GmailFeeder.prototype.onResponse = function(session, message) {
    var atomns = this.atomns;

    if (message.status_code != 200) { // 200 = OK
        if (message.status_code != 401) { // 401 = Unauthorized (authentication is required and has failed or has not yet been provided)
            if (this.callbacks.onError != undefined)
                this.callbacks.onError("feedReadFailed", "Status code : " + message.status_code);
        }
        return;
    }
  
    try {
        var feed = message.response_body.data;

        feed = feed.replace(/^<\?xml\s+version\s*=\s*(["'])[^\1]+\1[^?]*\?>/, "");
        feed = new XML(feed);  
    
        var newMailsCount = feed.atomns::entry.length();
    
        var params = { 'count' : newMailsCount, 'messages' : [] };

        for (var i = 0; i < newMailsCount; i++) {
            var entry = feed.atomns::entry[i];
            var message = {
                'title' : entry.atomns::title,
                'summary' : entry.atomns::summary,
                'authorName' : entry.atomns::author.atomns::name,
                'authorEmail' : entry.atomns::author.atomns::email,
            };
            params.messages.push(message);
        }

        if (this.callbacks.onChecked != undefined)
            this.callbacks.onChecked(params);
    }
    catch (e) {
        if (this.callbacks.onError != undefined) {
            this.callbacks.onError('feedParseFailed', e);
        }
    }
}
