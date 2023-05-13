import test from 'ava';
import { rest } from 'msw';
import { DiscogsClient } from '@lib/client.js';
import { setupMockAPI } from './_setup.test.js';

const server = setupMockAPI();

test.serial('DiscogsClient: Test get()', async t => {
    t.plan(1);
    server.use(
        rest.get('https://api.discogs.com/labels/1', (req, res, ctx) => {
            t.pass();
            return res(ctx.status(200), ctx.json({}));
        })
    );
    const client = new DiscogsClient();
    await client.get({ url: '/labels/1' });
});

test.serial('DiscogsClient: Test custom configuration', async t => {
    t.plan(1);
    server.use(
        rest.get('https://www.example.com/labels/1', (req, res, ctx) => {
            t.pass();
            return res(ctx.status(200), ctx.json({}));
        })
    );
    const client = new DiscogsClient().setConfig({ host: 'www.example.com' });
    await client.get({ url: '/labels/1' });
});

test.serial('DiscogsClient: Media Types (none, default)', async t => {
    t.plan(1);
    server.use(
        rest.get('https://api.discogs.com', (req, res, ctx) => {
            t.is(req.headers.get('Accept'), 'application/vnd.discogs.v2.discogs+json');
            return res(ctx.status(200), ctx.json({}));
        })
    );
    const client = new DiscogsClient();
    await client.about();
});

test.serial('DiscogsClient: Media Types (html)', async t => {
    t.plan(1);
    server.use(
        rest.get('https://api.discogs.com', (req, res, ctx) => {
            t.is(req.headers.get('Accept'), 'application/vnd.discogs.v2.html+json');
            return res(ctx.status(200), ctx.json({}));
        })
    );
    const client = new DiscogsClient().setConfig({ outputFormat: 'html' });
    await client.about();
});

test.serial('DiscogsClient: Media Types (plaintext)', async t => {
    t.plan(1);
    server.use(
        rest.get('https://api.discogs.com', (req, res, ctx) => {
            t.is(req.headers.get('Accept'), 'application/vnd.discogs.v2.plaintext+json');
            return res(ctx.status(200), ctx.json({}));
        })
    );
    const client = new DiscogsClient().setConfig({ outputFormat: 'plaintext' });
    await client.about();
});

// test.serial('DiscogsClient: User Agent (default)', async t => {
//     t.plan(1);
//     server.use(
//         rest.get('https://api.discogs.com', (req, res, ctx) => {
//             t.regex(req.headers.get('User-Agent'), /^DisConnectClient\/(.+) \+https:\/\/github\.com\/(.+)$/);
//             return res(ctx.status(200), ctx.json({}));
//         })
//     );
//     let client = new DiscogsClient();
//     await client.about();
// });

test.serial('DiscogsClient: User Agent (custom)', async t => {
    t.plan(1);
    server.use(
        rest.get('https://api.discogs.com', (req, res, ctx) => {
            t.is(req.headers.get('User-Agent'), 'MyDiscogsClient/1.0 +https://example.org');
            return res(ctx.status(200), ctx.json({}));
        })
    );
    const client = new DiscogsClient({ userAgent: 'MyDiscogsClient/1.0 +https://example.org' });
    await client.about();
});

test.serial('DiscogsClient: Auth (userToken)', async t => {
    t.plan(1);
    server.use(
        rest.get('https://api.discogs.com/oauth/identity', (req, res, ctx) => {
            t.is(req.headers.get('Authorization'), 'Discogs token=testtoken12345');
            return res(ctx.status(200), ctx.json({}));
        })
    );
    const client = new DiscogsClient({ auth: { userToken: 'testtoken12345' } });
    await client.getIdentity();
});

test.serial('DiscogsClient: Sends OAuth header', async t => {
    t.plan(1);

    server.use(
        rest.get('https://api.discogs.com/oauth/identity', (req, res, ctx) => {
            t.true(req.headers.get('Authorization')?.startsWith('OAuth '));
            return res(ctx.status(200), ctx.json({}));
        })
    );

    const client = new DiscogsClient({
        auth: {
            method: 'oauth',
            consumerKey: 'consumerKey',
            consumerSecret: 'consumerSecret',
            accessToken: 'accessToken',
            accessTokenSecret: 'accessTokenSecret',
        },
    });

    await client.getIdentity();
});

test.serial('DiscogsClient: Retrieves and passes rate limit info to caller', async t => {
    t.plan(2);

    server.use(
        rest.get('https://api.discogs.com/oauth/identity', (req, res, ctx) => {
            t.true(req.headers.get('Authorization')?.startsWith('OAuth '));
            return res(
                ctx.status(200),
                ctx.json({}),
                ctx.set({
                    'X-Discogs-Ratelimit': '60',
                    'X-Discogs-Ratelimit-Used': '23',
                    'X-Discogs-Ratelimit-Remaining': '37',
                })
            );
        })
    );

    const client = new DiscogsClient({
        auth: {
            method: 'oauth',
            consumerKey: 'consumerKey',
            consumerSecret: 'consumerSecret',
            accessToken: 'accessToken',
            accessTokenSecret: 'accessTokenSecret',
        },
    });

    const resp = await client.getIdentity();
    t.deepEqual(resp.rateLimit, { limit: 60, used: 23, remaining: 37 });
});

test.serial('DiscogsClient: Retries when rate limited', async t => {
    t.plan(3);

    let n = 0;
    server.use(
        rest.get('https://api.discogs.com/oauth/identity', (req, res, ctx) => {
            if (n++ == 0) {
                t.pass();
                return res(
                    ctx.status(429),
                    ctx.json({ message: "you're rate limited" }),
                    ctx.set({
                        'X-Discogs-Ratelimit': '60',
                        'X-Discogs-Ratelimit-Used': '60',
                        'X-Discogs-Ratelimit-Remaining': '0',
                    })
                );
            } else {
                t.pass();
                return res(
                    ctx.status(200),
                    ctx.json({ message: "you're good" }),
                    ctx.set({
                        'X-Discogs-Ratelimit': '60',
                        'X-Discogs-Ratelimit-Used': '59',
                        'X-Discogs-Ratelimit-Remaining': '1',
                    })
                );
            }
        })
    );

    const client = new DiscogsClient({ auth: { userToken: 'fake-token' } });
    client.setConfig({ exponentialBackoffMaxRetries: 1, exponentialBackoffIntervalMs: 100, exponentialBackoffRate: 2 });

    type FakeResponse = {
        data: {
            message: string;
        };
    };

    const resp = (await client.getIdentity()) as unknown as FakeResponse;
    t.deepEqual(resp.data, { message: "you're good" });
});

test.serial('DiscogsClient: Throws when retrying but end of retries is reached', async t => {
    t.plan(4);

    let n = 0;
    server.use(
        rest.get('https://api.discogs.com/oauth/identity', (req, res, ctx) => {
            if (n++ == 0) {
                t.pass();
                return res(
                    ctx.status(429),
                    ctx.json({ message: "you're rate limited 1" }),
                    ctx.set({
                        'X-Discogs-Ratelimit': '60',
                        'X-Discogs-Ratelimit-Used': '60',
                        'X-Discogs-Ratelimit-Remaining': '0',
                    })
                );
            } else {
                t.pass();
                return res(
                    ctx.status(429),
                    ctx.json({ message: "you're rate limited 2" }),
                    ctx.set({
                        'X-Discogs-Ratelimit': '60',
                        'X-Discogs-Ratelimit-Used': '60',
                        'X-Discogs-Ratelimit-Remaining': '0',
                    })
                );
            }
        })
    );

    const client = new DiscogsClient({ auth: { userToken: 'fake-token' } });
    client.setConfig({ exponentialBackoffMaxRetries: 1, exponentialBackoffIntervalMs: 100, exponentialBackoffRate: 2 });

    const err = await t.throwsAsync(() => client.getIdentity());
    t.is(err?.message, "you're rate limited 2");
});

test.serial('DiscogsClient: Should return client and server info in about call', async t => {
    t.plan(1);
    server.use(
        rest.get('https://api.discogs.com', (req, res, ctx) => {
            return res(
                ctx.status(200),
                ctx.json({
                    hello: 'Welcome to the Discogs API.',
                    api_version: 'v2',
                    documentation_url: 'http://www.discogs.com/developers/',
                    statistics: { releases: 16327979, artists: 8602060, labels: 1991222 },
                }),
                ctx.set({
                    'X-Discogs-Ratelimit': '60',
                    'X-Discogs-Ratelimit-Used': '59',
                    'X-Discogs-Ratelimit-Remaining': '1',
                })
            );
        })
    );
    const client = new DiscogsClient();
    const result = await client.about();
    t.deepEqual(result, {
        data: {
            hello: 'Welcome to the Discogs API.',
            api_version: 'v2',
            documentation_url: 'http://www.discogs.com/developers/',
            statistics: { releases: 16327979, artists: 8602060, labels: 1991222 },
            clientInfo: {
                version: 'dev',
                userAgent: '@lionralfs/discogs-client/dev +https://github.com/lionralfs/discogs-client',
                authMethod: 'none',
                authLevel: 0
            },
        },
        rateLimit: {
            limit: 60,
            used: 59,
            remaining: 1
        }
    });
});
