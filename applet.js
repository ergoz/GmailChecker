// Gmail Checker Cinnamon Applet
// Developed by Nicolas LLOBERA <nllobera@gmail.com> from
// # the Gmail Notifier Cinnamon Applet by denisigo <denis@sigov.ru> [http://cinnamon-spices.linuxmint.com/applets/view/73]
// # the icons of the gmail-plasmoid project - [http://code.google.com/p/gmail-plasmoid]
// version: 1.1 (03-03-2013)
// License: GPLv3
// Copyright © 2013 Nicolas LLOBERA


const Mainloop = imports.mainloop;
const Lang = imports.lang;
const Gettext = imports.gettext;
// for /usr/share/locale/xx/LC_MESSAGES/gnome-applets-3.0.mo file
Gettext.bindtextdomain("gnome-applets-3.0", "/usr/share/locale");
Gettext.textdomain("gnome-applets-3.0");
const _ = Gettext.gettext;

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Secret = imports.gi.Secret;
const Soup = imports.gi.Soup;
const St = imports.gi.St;

const Applet = imports.ui.applet;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Settings = imports.ui.settings;
const Util = imports.misc.util;

const AppletName = "Gmail Checker";
const GmailUrl = "https://mail.google.com";
const appletUUID = 'GmailChecker@LLOBERA';

const GMAILCHECKER_SCHEMA = new Secret.Schema(
    "org.gnome.Application.Password",
    Secret.SchemaFlags.NONE,
    {
        "string": Secret.SchemaAttributeType.STRING,
        "string": Secret.SchemaAttributeType.STRING
    }
);

const AppletDirectory = imports.ui.appletManager.appletMeta[appletUUID].path;
imports.searchPath.push(AppletDirectory);
const PopupMenuExtension = imports.popupImageLeftMenuItem;


function MyApplet(metadata, orientation, panel_height, instanceId) {
    this._init(metadata, orientation, panel_height, instanceId);
}

MyApplet.prototype = {
    __proto__: Applet.IconApplet.prototype,

    _init: function(metadata, orientation, panel_height, instanceId) {
        global.log("START");
        this.timer_id = 0;
        this.newEmailsCount = 0;

        Applet.IconApplet.prototype._init.call(this, orientation, panel_height, instanceId);

        try {
            this.set_applet_icon_path(AppletDirectory + '/icons/NoEmail.svg');
          
            this.menu = new Applet.AppletPopupMenu(this, orientation);
            this.menuManager = new PopupMenu.PopupMenuManager(this);
            this.menuManager.addMenu(this.menu);
          
            this.settings = new Settings.AppletSettings(this, appletUUID, instanceId);
            this.bindSettings();
          
            this.createContextMenu();
            
            this.init_email_feeder();
            

            if (this.checkCrendentials()) {
                // check after 2s
                this.update_timer(2000);
            }
            else {
                Util.spawnCommandLine("notify-send --icon=error \"" + AppletName + ": Unvalid credentials\"");
                Util.trySpawnCommandLine("cinnamon-settings applets " + appletUUID);
            }
        }
        catch (e) {
            global.logError(AppletName + ": " + e);
            Util.spawnCommandLine("notify-send --icon=error \"" + AppletName + ": " + e + "\"");
        }
    },
    
    on_applet_clicked: function(event) {
        this.menu.toggle();
    },
    
    createContextMenu: function() {
        let check_menu_item = new Applet.MenuItem("Check", "mail-receive"/*Gtk.STOCK_REFRESH*/, Lang.bind(this, function() {
            if (this.checkCrendentials())
                this.on_timer_elapsed();
            else
                Util.spawnCommandLine("notify-send --icon=error \"" + AppletName + ": Unvalid credentials.\"");
        }));
        this._applet_context_menu.addMenuItem(check_menu_item);
        
        this._applet_context_menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        let openGmail_menu_item = new Applet.MenuItem("Gmail", "internet-mail", function() {
            Main.Util.spawnCommandLine("xdg-open " + GmailUrl);
        });
        this._applet_context_menu.addMenuItem(openGmail_menu_item);
        
        this._applet_context_menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        let settingsItem = new Applet.MenuItem(_("Settings"), Gtk.STOCK_EDIT, function() {
            Util.trySpawnCommandLine("cinnamon-settings applets " + appletUUID);
        });
        this._applet_context_menu.addMenuItem(settingsItem);
        
        this._applet_context_menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        let help_menu_item = new Applet.MenuItem(_("Help"), Gtk.STOCK_HELP, function() {
            Main.Util.spawnCommandLine("xdg-open " + AppletDirectory + "/README.md");
        });
        this._applet_context_menu.addMenuItem(help_menu_item);
        
        let about_menu_item = new Applet.MenuItem(_("About"), Gtk.STOCK_ABOUT,  function() {
            Main.Util.spawnCommandLine("xdg-open " + AppletDirectory + "/LICENSE.md");
        });
        this._applet_context_menu.addMenuItem(about_menu_item);
    },

    bindSettings: function() {
        this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL,
            "EmailAccount", "newEmailAccount", this.on_email_changed, null);
            
        this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL,
            "Password", "newPassword", this.on_password_changed, null);
        
        this.settings.bindProperty(Settings.BindingDirection.IN,
            "MaxDisplayEmails", "maxDisplayEmails", this.on_settings_changed, null);
            
        this.settings.bindProperty(Settings.BindingDirection.IN,
            "CheckFrequency", "checkFrequency", this.on_settings_changed, null);
    },
    
    on_settings_changed: function() {
    },
    
    on_email_changed: function() {
        global.log("on_email_changed: " + this.newEmailAccount + " | " + this.emailAccount);
        // due to a bug in cinnamon applet all the binding functions are called even if the setting wasn't changed
        if (this.newEmailAccount && this.newEmailAccount != this.emailAccount) {
            // As invalid Google accounts is not detected as an error
            // here is a test to check the email syntax.
            // The regular expression is not specific to Gmail account 
            // since it is possible to set up Gmail for your own domain.
            // The problem still persists with syntaxical valid but non existing email account (dudul@gmail.com)
            var regex = new RegExp("[a-zA-Z0-9_\.-]+@[a-zA-Z0-9_\.-]+");
            if (regex.test(this.newEmailAccount)) {
                this.emailAccount = this.newEmailAccount;
                this.init_email_feeder();
            }
            else {
                this.newEmailAccount = this.emailAccount; // reset the incorrect email account
                Util.spawnCommandLine("notify-send --icon=error \"'"+ this.newEmailAccount + "' is not a correct email account (ex: name@gmail.com)\"");
            }
        }
    },
    
    on_password_changed: function() {
        global.log("on_password_changed: " + this.newPassword + " | " + this.password);
        // due to a bug in cinnamon applet all the binding functions are called even if the setting wasn't changed
        if (this.newPassword && this.newPassword != this.getPassword()) {
            //this.setPassword(this.newPassword);
            //this.newPassword = ""; // reset the password for security reasons
            this.init_email_feeder();
        }
    },

    // check if password and login are filled
    checkCrendentials: function() {
        global.log("checkCrendentials email: " + this.emailAccount + " password: " + this.password);
        return this.password && this.emailAccount; 
    },

    getPassword: function () {
        this.password = this.newPassword;
        
        /*this.password = Secret.password_lookup_sync(
            GMAILCHECKER_SCHEMA, { "string": appletUUID, "string": this.emailAccount }, null);*/
    },
    
    setPassword: function (password) {
        var attributes = {
            "string": appletUUID,
            "string": this.emailAccount
        };
         
        Secret.password_store_sync(
            GMAILCHECKER_SCHEMA, 
            attributes, 
            Secret.COLLECTION_DEFAULT,
            "Label", 
            "Password", 
            null);
            
        this.password = password;
    },

    on_error: function(errorCode, errorMessage) {        
        var message = "";
        switch (errorCode) {
            case 'authFailed':
                message = AppletName + ": authentication failed.";
                
                this.newEmailsCount = 0;
                this.menu.removeAll();
                
                var iconPath = AppletDirectory + "/icons/NoEmail.svg";
                if (this.__icon_name != iconPath)
                    this.set_applet_icon_path(iconPath);
                break;
                
            case 'feedReadFailed':
                message = AppletName + ": feed reading failed. " + errorMessage;
                break;
                
            case 'feedParseFailed':
                message = AppletName + ": feed parsing failed. " + errorMessage;
                break;
        }
        
        Util.spawnCommandLine("notify-send --icon=error \""+ message + "\"");
        this.set_applet_tooltip(message);
        global.logError(message);
    },
  
    on_checked: function(params) {
        if (params.count > 0) {        
            this.newEmailsCount = params.count;
            this.menu.removeAll();
            
            for (var i = 0; i < this.newEmailsCount && i < this.maxDisplayEmails ; i++) {
                var message = params.messages[i];
                
                if (i > 0) this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                
                var menuItem = new PopupMenuExtension.PopupImageLeftMenuItem(
                    _("From:") + " " + message.authorName + "\r\n" + 
                    message.title + "\r\n\r\n" + message.summary + "\r\n...", 
                    "mail-read", 
                    message.id == null ? 
                    "xdg-open " + GmailUrl :
                    "xdg-open " + GmailUrl + "/mail/#inbox/" + message.id);
                
                menuItem.connect("activate", function(actor, event) { Util.spawnCommandLine(actor.command); });
                this.menu.addMenuItem(menuItem);
            }

            this.set_applet_tooltip('You have ' + this.newEmailsCount + ' new mails.');
            
            var iconName = this.newEmailsCount > 9 ? "+" : this.newEmailsCount;
            var iconPath = AppletDirectory + "/icons/" + iconName + ".svg";
            if (this.__icon_name != iconPath)
                this.set_applet_icon_path(iconPath);
        }
        else {
            var iconPath = AppletDirectory + "/icons/NoEmail.svg";
            if (this.__icon_name != iconPath)
                this.set_applet_icon_path(iconPath);
            this.set_applet_tooltip("You don't have new emails.");
            this.newEmailsCount = 0;
            this.menu.removeAll();
        }
    },

    // update the time to wait until the next emails check
    update_timer: function(timeout) {
        global.log("update_timer " + timeout + " milliseconds");
        // if this.timer_id != 0, it means a timer is running
        if (this.timer_id) {
            // stop the current running timer
            Mainloop.source_remove(this.timer_id);
            this.timer_id = 0;
        }
        
        if (timeout > 0) {
            // start a new timer with the new timeout
            this.timer_id = Mainloop.timeout_add(timeout, Lang.bind(this, this.on_timer_elapsed));
        }
    },

    // when it's time to check the emails
    on_timer_elapsed: function() {
        global.log("on_timer_elapsed");
        this.check_emails();
        this.update_timer(this.checkFrequency * 60000); // 60 * 1000 : minuts to milliseconds
    },
    
    init_email_feeder: function() {
        this.emailAccount = this.newEmailAccount;
        this.getPassword();
        
        // Creating Namespace
        this.atomns = new Namespace('http://purl.org/atom/ns#');
        
        // Creating SessionAsync
        this.http_session = new Soup.SessionAsync();
        
        // Adding ProxyResolverDefault
        Soup.Session.prototype.add_feature.call(this.http_session, new Soup.ProxyResolverDefault());
        
        // Connecting to authenticate signal
        this.http_session.connect('authenticate', Lang.bind(this, this.on_authentication));
    },
    
    on_authentication: function(session, msg, auth, retrying, user_data) {
        if (retrying)
            this.on_error("authFailed");
        else
            auth.authenticate(this.emailAccount, this.password);
    },
    
    check_emails: function() {
        let message = Soup.Message.new('GET', 'https://mail.google.com/mail/feed/atom/');
        this.http_session.queue_message(message, Lang.bind(this, this.on_response));
    },
    
    on_response: function(session, message) {
        var atomns = this.atomns;

        if (message.status_code != 200) {
            if (message.status_code != 401 && message.status_code != 7) {
                    this.on_error("feedReadFailed", "Status code : " + message.status_code);
            }
            
            // log only for warning message
            global.log("Feed reading failed. Status code : " + message.status_code);
            return;
        }
        
        /* Status Code
         * 1 SOUP_STATUS_CANCELLED
         * 2 SOUP_STATUS_CANT_RESOLVE
         * 3 SOUP_STATUS_CANT_RESOLVE_PROXY
         * 4 SOUP_STATUS_CANT_CONNECT
         * 5 SOUP_STATUS_CANT_CONNECT_PROXY
         * 6 SOUP_STATUS_SSL_FAILED
         * 7 SOUP_STATUS_IO_ERROR
         * 8 SOUP_STATUS_MALFORMED
         * 9 SOUP_STATUS_TRY_AGAIN
         * 10 SOUP_STATUS_TOO_MANY_REDIRECTS
         * 11 SOUP_STATUS_TLS_FAILED
         * 
         * 200 Ok
         * 
         * 401 Unauthorized (authentication is required and has failed or has not yet been provided)
         * 405 Method Not Allowed
         */

        try {
            let feed = message.response_body.data;

            feed = feed.replace(/^<\?xml\s+version\s*=\s*(["'])[^\1]+\1[^?]*\?>/, "");
            feed = new XML(feed); // ECMAScript for XML (E4X)

            let newMailsCount = feed.atomns::entry.length();

            let params = { 'count' : newMailsCount, 'messages' : [] };
            
            let messageIdRegex = new RegExp("message_id=([a-z0-9]+)&");
            
            for (let i = 0; i < newMailsCount; i++) {
                let entry = feed.atomns::entry[i];
                
                let messageId = entry.atomns::link.@href;
                let resultRegex = messageIdRegex.exec(messageId);
                
                let email = {
                        'title' : entry.atomns::title,
                        'summary' : entry.atomns::summary,
                        'authorName' : entry.atomns::author.atomns::name,
                        'authorEmail' : entry.atomns::author.atomns::email,
                        'id' : resultRegex != null && resultRegex.length > 1 ? resultRegex[1] : null
                };
                params.messages.push(email);
            }

            this.on_checked(params);
        }
        catch (e) {
            this.on_error('feedParseFailed', e);
        }
    }
};

function main(metadata, orientation, panel_height, instanceId) {
    let myApplet = new MyApplet(metadata, orientation, panel_height, instanceId);
    return myApplet;
}
