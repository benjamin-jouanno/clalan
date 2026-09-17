import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { and, desc, eq, isNotNull, or } from 'drizzle-orm';
import { hash, compare } from 'bcryptjs';
import { z } from 'zod';
import { db } from './db/client';
import { comments, postUpvotes, posts, users } from './db/schema';
import { createToken, requireAuth, type AuthUser } from './auth';

const registrationSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(24)
    .regex(/^[a-z0-9_-]+$/),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
});
const loginSchema = z.object({
  identifier: z.string().trim().toLowerCase().min(3),
  password: z.string().min(8).max(128),
});
const gameDataSchema = z.object({
  faction: z.enum(['alliance', 'horde']).nullable(),
  characterName: z.string().trim().min(1).max(24).nullable(),
  race: z.enum(['human', 'dwarf', 'night-elf', 'gnome', 'orc', 'undead', 'tauren', 'goblin']).nullable(),
  className: z.enum(['warrior', 'paladin', 'hunter', 'rogue', 'priest', 'shaman', 'mage', 'warlock', 'druid']).nullable(),
  role: z.enum(['dps', 'tank', 'heal']).nullable(),
}).superRefine((gameData, context) => {
  const playableClasses: Record<string, string[]> = {
    human: ['warrior', 'paladin', 'hunter', 'rogue', 'priest', 'mage', 'warlock'],
    dwarf: ['warrior', 'paladin', 'hunter', 'rogue', 'priest', 'shaman'],
    'night-elf': ['warrior', 'hunter', 'rogue', 'priest', 'druid'],
    gnome: ['warrior', 'rogue', 'mage', 'warlock', 'priest'],
    orc: ['warrior', 'hunter', 'rogue', 'shaman', 'warlock', 'mage'],
    undead: ['warrior', 'rogue', 'priest', 'mage', 'warlock', 'paladin'],
    tauren: ['warrior', 'hunter', 'shaman', 'druid'],
    goblin: ['warrior', 'rogue', 'mage', 'warlock'],
  };
  const classRoles: Record<string, string[]> = {
    warrior: ['dps', 'tank'],
    paladin: ['dps', 'tank', 'heal'],
    hunter: ['dps'],
    rogue: ['dps'],
    priest: ['dps', 'heal'],
    shaman: ['dps', 'heal'],
    mage: ['dps'],
    warlock: ['dps'],
    druid: ['dps', 'tank', 'heal'],
  };
  if (gameData.race && gameData.className && !playableClasses[gameData.race]?.includes(gameData.className)) {
    context.addIssue({ code: 'custom', path: ['className'], message: 'That class is not playable by the selected race' });
  }
  if (gameData.className && gameData.role && !classRoles[gameData.className]?.includes(gameData.role)) {
    context.addIssue({ code: 'custom', path: ['role'], message: 'That role is not available for the selected class' });
  }
});

const app = new Hono<{ Variables: { user: AuthUser } }>();
const allowedOrigins = (process.env['CLIENT_ORIGIN'] ??
  'http://localhost:4200,http://217.182.69.62:4200,http://217.182.69.62')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  '*',
  cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : undefined),
  }),
);

app.get('/health', (c) => c.json({ status: 'ok' }));

app.post('/auth/register', async (c) => {
  const parsed = registrationSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json(
      { error: 'Username must be 3–24 ASCII letters, numbers, underscores, or hyphens with no spaces' },
      400,
    );
  }

  const existing = db
    .select({ id: users.id, email: users.email, username: users.username })
    .from(users)
    .where(or(eq(users.email, parsed.data.email), eq(users.username, parsed.data.username)))
    .get();
  if (existing) {
    return c.json(
      {
        error:
          existing.email === parsed.data.email
            ? 'An account with that email already exists'
            : 'That username is already taken',
      },
      409,
    );
  }

  const user = db
    .insert(users)
    .values({
      email: parsed.data.email,
      username: parsed.data.username ?? parsed.data.email.split('@')[0],
      passwordHash: await hash(parsed.data.password, 12),
      createdAt: new Date(),
    })
    .returning({ id: users.id, username: users.username, email: users.email })
    .get();

  return c.json({ user, token: await createToken(user) }, 201);
});

app.post('/auth/login', async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: 'Username or email and password are required' }, 400);
  }

  const user = db.select().from(users).where(eq(users.email, parsed.data.identifier)).get()
    ?? db.select().from(users).where(eq(users.username, parsed.data.identifier)).get();
  if (!user || !(await compare(parsed.data.password, user.passwordHash))) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const authUser = { id: user.id, username: user.username, email: user.email };
  return c.json({ user: authUser, token: await createToken(authUser) });
});

app.get('/auth/me', requireAuth, (c) => c.json({ user: c.get('user') }));

app.get('/api/profile', requireAuth, (c) => c.json({ user: c.get('user') }));

app.get('/api/account', requireAuth, (c) => {
  const account = db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      createdAt: users.createdAt,
      faction: users.faction,
      characterName: users.characterName,
      race: users.race,
      className: users.className,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, c.get('user').id))
    .get();

  if (!account) {
    return c.json({ error: 'Account not found' }, 404);
  }

  return c.json({
    account: {
      id: account.id,
      username: account.username,
      email: account.email,
      createdAt: account.createdAt,
      gameData: {
        faction: account.faction,
        characterName: account.characterName,
        race: account.race,
        className: account.className,
        role: account.role,
      },
    },
  });
});

app.get('/api/guild-members', requireAuth, (c) => {
  const members = db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      createdAt: users.createdAt,
      faction: users.faction,
      characterName: users.characterName,
      race: users.race,
      className: users.className,
      role: users.role,
    })
    .from(users)
    .where(
      and(
        isNotNull(users.faction),
        isNotNull(users.characterName),
        isNotNull(users.race),
        isNotNull(users.className),
        isNotNull(users.role),
      ),
    )
    .all();

  return c.json({
    members: members.map((member) => ({
      id: member.id,
      username: member.username,
      gameData: {
        faction: member.faction,
        characterName: member.characterName,
        race: member.race,
        className: member.className,
        role: member.role,
      },
    })),
  });
});

app.get('/api/posts', requireAuth, (c) => {
    const postRows = db
      .select({
        id: posts.id,
        content: posts.content,
        createdAt: posts.createdAt,
        authorId: users.id,
        username: users.username,
        race: users.race,
        className: users.className,
        role: users.role,
      })
      .from(posts)
      .innerJoin(users, eq(posts.authorId, users.id))
      .orderBy(desc(posts.createdAt))
      .all();

    const postList = postRows.map((post) => {
      const postComments = db
        .select({
          id: comments.id,
          content: comments.content,
          createdAt: comments.createdAt,
          authorId: users.id,
          username: users.username,
          race: users.race,
          className: users.className,
        })
        .from(comments)
        .innerJoin(users, eq(comments.authorId, users.id))
        .where(eq(comments.postId, post.id))
        .orderBy(comments.createdAt)
        .all();
      const upvotes = db.select({ id: postUpvotes.id }).from(postUpvotes).where(eq(postUpvotes.postId, post.id)).all();
      const viewerUpvote = Boolean(db.select({ id: postUpvotes.id }).from(postUpvotes)
        .where(and(eq(postUpvotes.postId, post.id), eq(postUpvotes.userId, c.get('user').id))).get());

      return {
        id: post.id,
        content: post.content,
        createdAt: post.createdAt,
        author: {
          id: post.authorId,
          username: post.username,
          gameData: { race: post.race, className: post.className, role: post.role },
        },
        upvotes: upvotes.length,
        viewerUpvote,
        comments: postComments.map((comment) => ({
          id: comment.id,
          content: comment.content,
          createdAt: comment.createdAt,
          author: {
            id: comment.authorId,
            username: comment.username,
            gameData: { race: comment.race, className: comment.className },
          },
        })),
      };
    });

    return c.json({ posts: postList });
});

app.post('/api/posts', requireAuth, async (c) => {
    const parsed = z.object({ content: z.string().trim().min(1).max(2000) }).safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: 'Post content must contain between 1 and 2000 characters' }, 400);
    }
    const post = db.insert(posts).values({
      authorId: c.get('user').id,
      content: parsed.data.content,
      createdAt: new Date(),
    }).returning({ id: posts.id }).get();
    return c.json({ id: post.id }, 201);
});

app.delete('/api/posts/:id', requireAuth, (c) => {
    const postId = Number(c.req.param('id'));
    if (!Number.isInteger(postId)) {
      return c.json({ error: 'Invalid post' }, 400);
    }

    const post = db.select({ id: posts.id, authorId: posts.authorId })
      .from(posts)
      .where(eq(posts.id, postId))
      .get();
    if (!post) {
      return c.json({ error: 'Post not found' }, 404);
    }
    if (post.authorId !== c.get('user').id) {
      return c.json({ error: 'Only the post author can delete it' }, 403);
    }

    db.delete(comments).where(eq(comments.postId, postId)).run();
    db.delete(postUpvotes).where(eq(postUpvotes.postId, postId)).run();
    db.delete(posts).where(eq(posts.id, postId)).run();
    return c.body(null, 204);
});

app.post('/api/posts/:id/comments', requireAuth, async (c) => {
    const postId = Number(c.req.param('id'));
    const parsed = z.object({ content: z.string().trim().min(1).max(1000) }).safeParse(await c.req.json());
    if (!Number.isInteger(postId) || !parsed.success) {
      return c.json({ error: 'Invalid comment' }, 400);
    }
    const post = db.select({ id: posts.id }).from(posts).where(eq(posts.id, postId)).get();
    if (!post) {
      return c.json({ error: 'Post not found' }, 404);
    }
    const comment = db.insert(comments).values({
      postId,
      authorId: c.get('user').id,
      content: parsed.data.content,
      createdAt: new Date(),
    }).returning({ id: comments.id }).get();
    return c.json({ id: comment.id }, 201);
});

app.post('/api/posts/:id/upvote', requireAuth, (c) => {
    const postId = Number(c.req.param('id'));
    if (!Number.isInteger(postId)) {
      return c.json({ error: 'Invalid post' }, 400);
    }
    const post = db.select({ id: posts.id }).from(posts).where(eq(posts.id, postId)).get();
    if (!post) {
      return c.json({ error: 'Post not found' }, 404);
    }
    const existing = db.select({ id: postUpvotes.id }).from(postUpvotes)
      .where(and(eq(postUpvotes.postId, postId), eq(postUpvotes.userId, c.get('user').id))).get();
    if (existing) {
      db.delete(postUpvotes).where(eq(postUpvotes.id, existing.id)).run();
    } else {
      db.insert(postUpvotes).values({ postId, userId: c.get('user').id }).run();
    }
    const count = db.select({ id: postUpvotes.id }).from(postUpvotes).where(eq(postUpvotes.postId, postId)).all().length;
    return c.json({ upvoted: !existing, upvotes: count });
});

app.patch('/api/account/game-data', requireAuth, async (c) => {
  const parsed = gameDataSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: 'Invalid game data' }, 400);
  }

  const userId = c.get('user').id;
  const updated = db
    .update(users)
    .set({
      faction: parsed.data.faction,
      characterName: parsed.data.characterName,
      race: parsed.data.race,
      className: parsed.data.className,
      role: parsed.data.role,
    })
    .where(eq(users.id, userId))
    .returning({ id: users.id })
    .get();

  if (!updated) {
    return c.json({ error: 'Account not found' }, 404);
  }

  return c.json({ gameData: parsed.data });
});

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: 'Internal server error' }, 500);
});

const port = Number(process.env['PORT'] ?? 3000);
console.log(`API listening on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
