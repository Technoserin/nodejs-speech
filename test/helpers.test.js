/*!
 * Copyright 2017 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var assert = require('assert');
var Buffer = require('safe-buffer').Buffer;
var common = require('@google-cloud/common');
var proxyquire = require('proxyquire');
var sinon = require('sinon');
var stream = require('stream');

describe('Speech helper methods', () => {
  var client;
  var FakeApiErrorOverride;
  var sandbox = sinon.createSandbox();
  var speech;

  class FakeApiError extends common.util.ApiError {
    constructor(error) {
      super();

      if (FakeApiErrorOverride) {
        return FakeApiErrorOverride(error);
      }
    }
  }

  before(() => {
    speech = proxyquire('../', {
      './helpers.js': proxyquire('../src/helpers.js', {
        '@google-cloud/common': {
          util: {
            ApiError: FakeApiError,
          },
        },
      }),
    });
  });

  beforeEach(() => {
    client = new speech.v1.SpeechClient();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('streamingRecognize', () => {
    var CONFIG = {
      config: {encoding: 'LINEAR16', languageCode: 'en-us', sampleRate: 16000},
    };
    var OPTIONS = {timeout: Infinity};

    it('writes the config to the resulting stream', done => {
      // Stub the underlying _streamingRecognize method to just return
      // a bogus stream.
      var requestStream = new stream.PassThrough({objectMode: true});
      var sr = sandbox
        .stub(client._innerApiCalls, 'streamingRecognize')
        .returns(requestStream);

      // Call the new helper method and establish that the config was
      // forwarded as expected.
      var userStream = client.streamingRecognize(CONFIG, OPTIONS);

      // Establish that the underlying streamingRecognize was called with
      // the options.
      assert(sr.calledOnce);
      assert(sr.calledWithExactly(OPTIONS));

      requestStream._write = (data, enc, next) => {
        assert.deepStrictEqual(data, {
          streamingConfig: CONFIG,
        });
        setImmediate(done);
        next(null, data);
      };

      userStream.write(undefined);
    });

    it('does not require options', () => {
      // Stub the underlying _streamingRecognize method to just return
      // a bogus stream.
      var requestStream = new stream.PassThrough({objectMode: true});
      var sr = sandbox
        .stub(client._innerApiCalls, 'streamingRecognize')
        .returns(requestStream);

      var userStream = client.streamingRecognize(CONFIG);

      userStream.emit('writing');

      assert(sr.calledOnce);
      assert(sr.calledWithExactly({}));
    });

    it('destroys the user stream when the request stream errors', done => {
      // Stub the underlying _streamingRecognize method to just return
      // a bogus stream.
      var requestStream = new stream.PassThrough({objectMode: true});
      sandbox
        .stub(client._innerApiCalls, 'streamingRecognize')
        .returns(requestStream);

      var userStream = client.streamingRecognize(CONFIG, OPTIONS);

      var error = new Error('Request stream error');

      userStream.once('error', err => {
        assert.strictEqual(err, error);
        done();
      });

      requestStream.emit('error', error);
    });

    it('destroys the user stream when the response contains an error', done => {
      // Stub the underlying _streamingRecognize method to just return
      // a bogus stream.
      var requestStream = new stream.PassThrough({objectMode: true});
      sandbox
        .stub(client._innerApiCalls, 'streamingRecognize')
        .returns(requestStream);

      var userStream = client.streamingRecognize(CONFIG, OPTIONS);

      var error = {};
      var fakeApiError = {};

      FakeApiErrorOverride = err => {
        assert.strictEqual(err, error);
        return fakeApiError;
      };

      userStream.once('error', err => {
        assert.strictEqual(err, fakeApiError);
        done();
      });

      userStream.emit('writing');
      requestStream.end({error});
    });

    it('re-emits response from the request stream', done => {
      // Stub the underlying _streamingRecognize method to just return
      // a bogus stream.
      var requestStream = new stream.PassThrough({objectMode: true});
      sandbox
        .stub(client._innerApiCalls, 'streamingRecognize')
        .returns(requestStream);

      var userStream = client.streamingRecognize(CONFIG, OPTIONS);

      var response = {};

      userStream.on('response', _response => {
        assert.strictEqual(_response, response);
        done();
      });

      userStream.emit('writing');
      requestStream.emit('response', response);
    });

    it('wraps incoming audio data', done => {
      // Stub the underlying _streamingRecognize method to just return
      // a bogus stream.
      var requestStream = new stream.PassThrough({objectMode: true});

      sandbox
        .stub(client._innerApiCalls, 'streamingRecognize')
        .returns(requestStream);

      var userStream = client.streamingRecognize(CONFIG, OPTIONS);
      var audioContent = Buffer.from('audio content');

      var count = 0;
      requestStream._write = (data, enc, next) => {
        if (count === 0)
          assert.deepStrictEqual(data, {
            streamingConfig: CONFIG,
          });
        else if (count === 1) {
          assert.deepStrictEqual(data, {
            audioContent: audioContent,
          });
          setImmediate(done);
        }
        count++;
        next(null, data);
      };

      userStream.end(audioContent);
    });
  });
});
