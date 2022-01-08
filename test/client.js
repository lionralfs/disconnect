import test from 'ava';
import { rest } from 'msw';
import { setupServer } from 'msw/node/lib/index.js';
import { DiscogsClient } from '../lib/client.js';

const server = setupServer(
    rest.get('https://api.discogs.com/labels/1', (req, res, ctx) => {
        return res(ctx.status(200), ctx.json({ result: 'success', id: 1 }));
    }),
    rest.get('https://api.discogs.com/', (req, res, ctx) => {
        return res(ctx.status(200), ctx.json({}));
    }),
    rest.get('https://www.example.com/labels/1', (req, res, ctx) => {
        return res(ctx.status(200), ctx.json({ result: 'success' }));
    })
);

// Enable API mocking before tests.
test.before(() => server.listen());

// Reset any runtime request handlers we may add during the tests.
test.afterEach(() => server.resetHandlers());

// Disable API mocking after the tests are done.
test.after(() => server.close());

test('DiscogsClient: Test instance', t => {
    t.true(new DiscogsClient() instanceof DiscogsClient);
});

test('DiscogsClient: Test authenticated()', t => {
    t.false(new DiscogsClient().authenticated(1), 'Authentication level 1 === false');
});

test('DiscogsClient: Test get()', async t => {
    let client = new DiscogsClient();
    let data = await client.get({ url: '/labels/1' });
    t.is(data?.id, 1, 'Correct response data');
});

test('DiscogsClient: Test Promise', async t => {
    let client = new DiscogsClient();
    let promise = client.about();
    t.is(typeof promise.then, 'function');

    let data = await promise;
    t.not(typeof data.disconnect, 'undefined', 'Promise resolved');
});

test('DiscogsClient: Test custom configuration', async t => {
    let client = new DiscogsClient().setConfig({ host: 'www.example.com' });
    let data = await client.get({ url: '/labels/1' });

    t.is(data?.result, 'success', 'Correct response data');
});
