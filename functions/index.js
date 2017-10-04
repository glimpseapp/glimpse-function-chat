'use strict';

const functions = require('firebase-functions');
const uuidv4 = require('uuid/v4');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);
const express = require('express');
const app = express();

// Validate the user is logged in taking the Firebase JWT, and adding uid and email to the req.user
const validateFirebaseIdToken = (req, res, next) => {
    if (req.originalUrl == '/healthz') {
        return res.send({status: true});
    }

    if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
        return res.status(403).send('Unauthorized');
    }

    // Read the ID Token from the Authorization header.
    let idToken = req.headers.authorization.split('Bearer ')[1];

    admin.auth().verifyIdToken(idToken).then(decodedIdToken => {
        console.log('Authenticated ', decodedIdToken.email);
        req.user = decodedIdToken;
        next();
    }).catch(error => {
        console.error('Error while verifying Firebase ID token:', error);
        res.status(403).send('Unauthorized');
    });
};

app.use(validateFirebaseIdToken);

app.post('/chat', (req, res) => {
    const chatId = uuidv4();
    const userIds = req.body.author_ids && Array.isArray(req.body.author_ids) ? req.body.author_ids : [];
    userIds.push(req.user.uid);
    const ts = Date.now();
    const data = {}
    data[chatId] = {
        author_ids: userIds,
        ts: ts,
        id: chatId
    };
    admin.database().ref(`/chat/chat_by_id`).set(data, function (error) {
        if (error)
            return res.send({error: error});

        const data = {
            ts: ts
        }
        admin.database().ref(`/chat/chat_by_author_id/${req.user.uid}/chat_ids/${chatId}`).set(data, function (error) {
            if (error)
                return res.send({error: error})

            res.send({success: true, id: chatId});
        });
    });
});

app.get('/chats', (req, res) => {
    admin.database().ref(`/chat/chat_by_author_id/${req.user.uid}`).once('value').then(chats => res.send(chats.val()));
});

app.post('/chat/:chat_id/message', (req, res) => {
    const message = {
        author_id: req.user.uid,
        time: Date.now(),
        type: req.body.type
    }

    switch(req.body.type) {
        case 'text':
            message['text'] = req.body.text;
            break;
        case 'glimpse':
            message['asset_name'] = req.body.asset_name;
            break;
        case 'glimpse_narrative':
            message['asset_name'] = req.body.asset_name;
            message['path_id'] = req.body.path_id;
    }

    admin.database().ref(`/chat/chat_by_id/${req.params.chat_id}/messages`).push(message, function (error) {
        if (error)
            return res.send({error: error})
        res.send({success: true});
    });

});

app.get('/chat/:chat_id', (req, res) => {
    admin.database().ref(`/chat/chat_by_id/${req.params.chat_id}`).once('value').then(chat => res.send(chat.val()));
});

exports.chat = functions.https.onRequest(app);
