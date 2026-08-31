const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

// --- 1. ENVIRONMENT & CLIENT SETUP ---
const token = process.env.BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!token) {
    console.error('BOT_TOKEN environment variable is missing!');
    process.exit(1);
}

const bot = new Telegraf(token);
const supabase = createClient(supabaseUrl, supabaseKey);

// --- 2. EXPRESS SERVER FOR RENDER FREE WEB SERVICE ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Arovaq Bot is running live and healthy!');
});

app.listen(PORT, () => {
    console.log(`HTTP health check server listening on port ${PORT}`);
});

// --- 3. BOT COMMAND HANDLERS ---

// /start command: Registers user and tracks referral deep links (e.g. ?start=6337270274)
bot.command('start', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const username = ctx.from.username || 'user_' + userId;
        const startPayload = ctx.payload; // Captures referrer Telegram ID if provided

        console.log(`User started bot: ${userId} (@${username}), Referrer: ${startPayload || 'None'}`);

        // Save/Update user profile in Supabase
        await supabase.from('profiles').upsert({
            telegram_id: String(userId),
            username: username,
            role: 'creator'
        }, { onConflict: 'telegram_id' });

        // Save/Update affiliate record and bind referrer if present
        await supabase.from('affiliates').upsert({
            telegram_id: String(userId),
            username: username,
            referred_by: startPayload ? String(startPayload) : null
        }, { onConflict: 'telegram_id' });

        const welcomeMessage = `👋 **Welcome to AROVAQ — VERIFIED VALUE.**\n\n` +
            `A connected digital marketplace where creators, sellers, buyers, and affiliates meet.\n\n` +
            `✨ Create\n📦 Sell\n🛒 Buy\n📈 Earn\n\n` +
            `🔒 Your account is securely bound to your unique Telegram ID (${userId}) for verified product access.`;

        await ctx.reply(welcomeMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🚀 Open Arovaq Mini App', web_app: { url: process.env.WEB_APP_URL || 'https://arovaq-landingpage.vercel.app' } }],
                    [{ text: '📁 Categories', callback_data: 'btn_categories' }, { text: '🏆 Rankings', callback_data: 'btn_rankings' }],
                    [{ text: '📦 List Product', callback_data: 'btn_list' }]
                ]
            }
        });
    } catch (err) {
        console.error('Error in /start command:', err);
        await ctx.reply('⚠️ Welcome! An error occurred while setting up your profile.');
    }
});

// /leaderboard command: Fetches live top affiliates and creators from Supabase
bot.command('leaderboard', async (ctx) => {
    try {
        // Fetch top affiliates from Supabase
        const { data: affiliates, error: affError } = await supabase
            .from('affiliates')
            .select('username, earnings')
            .order('earnings', { ascending: false })
            .limit(3);

        if (affError) console.error('Affiliate fetch error:', affError.message);

        // Fetch top creators from Supabase
        const { data: creators, error: creatorError } = await supabase
            .from('profiles')
            .select('username, earnings')
            .order('earnings', { ascending: false })
            .limit(3);

        if (creatorError) console.error('Creator fetch error:', creatorError.message);

        let message = `🏆 **AROVAQ Pre-Launch Network Rankings** 🏆\n\n`;

        message += `👥 **Top Affiliates**\n`;
        if (affiliates && affiliates.length > 0) {
            affiliates.forEach((item, index) => {
                message += `${index + 1}. @${item.username || 'user'} — $${Number(item.earnings || 0).toLocaleString()}\n`;
            });
        } else {
            message += `1. No entries yet\n`;
        }

        message += `\n🚀 **Top Creators**\n`;
        if (creators && creators.length > 0) {
            creators.forEach((item, index) => {
                message += `${index + 1}. @${item.username || 'creator'} — $${Number(item.earnings || 0).toLocaleString()}\n`;
            });
        } else {
            message += `1. No entries yet\n`;
        }

        message += `\n💡 **Pre-Launch Note**\n15-month reward window active.\n5% foundational yield starting from listing date.\n\n✨ **VERIFIED VALUE.**`;

        await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (err) {
        console.error('Error fetching live leaderboard:', err);
        await ctx.reply('⚠️ Unable to fetch live rankings right now. Please try again shortly.');
    }
});

// /categories command: Fetches active product drops from Supabase
bot.command('categories', async (ctx) => {
    try {
        const { data: products, error } = await supabase
            .from('products')
            .select('title, price_usd')
            .limit(5);

        if (error) {
            console.error('Error fetching products:', error.message);
            return ctx.reply('⚠️ Unable to load categories right now.');
        }

        let message = `📁 **AROVAQ Curated Categories & Drops**\n\n`;
        if (products && products.length > 0) {
            products.forEach((p, i) => {
                message += `${i + 1}. **${p.title}** — $${p.price_usd}\n`;
            });
        } else {
            message += `No active product drops listed yet. Use /list to add your product!`;
        }

        await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (err) {
        console.error('Error in /categories:', err);
        await ctx.reply('⚠️ Error loading categories.');
    }
});

// /list command: Directs users to list items
bot.command('list', async (ctx) => {
    await ctx.reply(
        `📦 **List Your Digital Product or Service**\n\n` +
        `To list your assets on Arovaq and secure your foundational yield, open the Mini App below.`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🚀 Open Arovaq Mini App to List', web_app: { url: process.env.WEB_APP_URL || 'https://arovaq-landingpage.vercel.app' } }]
                ]
            }
        }
    );
});

// --- 4. CALLBACK BUTTON HANDLERS ---
bot.action('btn_categories', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.reply('Type /categories to browse active product shelves.');
});

bot.action('btn_rankings', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.reply('Type /leaderboard to view live network rankings.');
});

bot.action('btn_list', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.reply('Type /list to start listing your product.');
});

// --- 5. LAUNCH BOT ---
bot.launch().then(() => {
    console.log('🤖 Arovaq Telegram Bot successfully launched and polling!');
}).catch(err => {
    console.error('Failed to launch bot:', err);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));