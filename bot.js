const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

// --- 1. ENVIRONMENT & CLIENT SETUP ---
const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const webAppUrl = process.env.WEB_APP_URL || process.env.AROVAQ_MINI_APP_URL || 'https://arovaq-landingpage.vercel.app';

if (!token) {
    console.error('BOT_TOKEN / TELEGRAM_BOT_TOKEN environment variable is missing!');
    process.exit(1);
}

const bot = new Telegraf(token);
const supabase = createClient(supabaseUrl, supabaseKey);

// --- 2. EXPRESS SERVER (HEALTH CHECK & MINI APP LISTING API) ---
const app = express();
app.use(express.json()); // Required to parse JSON payloads from your Mini App

const PORT = process.env.PORT || 3000;

// Health check route for Render
app.get('/', (req, res) => {
    res.send('Arovaq Bot and API server is running live and healthy!');
});

// API Endpoint called by your Mini App when a user lists a product
app.post('/api/list', async (req, res) => {
    try {
        const { sellerTelegramId, title, price } = req.body;

        if (!sellerTelegramId || !title) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // 1. Save the product to Supabase
        const { error: dbError } = await supabase.from('products').insert([{
            seller_id: String(sellerTelegramId),
            title: title,
            price: price || '0'
        }]);

        if (dbError) {
            console.error('Supabase product insert error:', dbError);
        }

        // 2. Notify the seller on Telegram
        await bot.telegram.sendMessage(
            sellerTelegramId,
            `📦 **Success!** Your product "${title}" has been listed on Arovaq.`,
            { parse_mode: 'Markdown' }
        ).catch(err => console.error('Failed to notify seller:', err));

        // 3. Find the referrer in Supabase affiliates table and notify them
        const { data: affiliate } = await supabase
            .from('affiliates')
            .select('referred_by')
            .eq('telegram_id', String(sellerTelegramId))
            .single();

        if (affiliate && affiliate.referred_by) {
            await bot.telegram.sendMessage(
                affiliate.referred_by,
                `🎉 **Great news!** Your referral just successfully listed a new product ("${title}") on Arovaq.`,
                { parse_mode: 'Markdown' }
            ).catch(err => console.error('Failed to notify referrer:', err));
        }

        return res.status(200).json({ success: true, message: 'Product listed and notifications sent!' });
    } catch (err) {
        console.error('Error in /api/list endpoint:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`HTTP server & API listening on port ${PORT}`);
});

// --- 3. BOT COMMAND HANDLERS ---

// /start command: Registers user and tracks referral deep links
bot.command('start', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const username = ctx.from.username || 'user_' + userId;
        const startPayload = ctx.payload; // Captures Person A's ID if clicked from a referral link

        // Save or update user profile
        await supabase.from('profiles').upsert({
            telegram_id: String(userId),
            username: username,
            role: 'creator'
        }, { onConflict: 'telegram_id' });

        // Save or update affiliate record with referral binding if payload exists
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
                    [{ text: '🚀 Open Arovaq Mini App', web_app: { url: webAppUrl } }],
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

// /leaderboard command: Dynamic Supabase tracking with First-Come (<10) vs Volume (>10) rules
bot.command('leaderboard', async (ctx) => {
    try {
        // 1. Fetch Affiliates Leaderboard from Supabase
        const { data: affiliatesData } = await supabase
            .from('affiliates')
            .select('username, referred_by')
            .not('referred_by', 'is', null);

        const affiliateCounts = {};
        if (affiliatesData) {
            affiliatesData.forEach(row => {
                const refBy = row.referred_by;
                affiliateCounts[refBy] = (affiliateCounts[refBy] || 0) + 1;
            });
        }
        
        const sortedAffiliates = Object.entries(affiliateCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        let affiliateText = "";
        if (sortedAffiliates.length > 0) {
            sortedAffiliates.forEach(([id, count], idx) => {
                affiliateText += `${idx + 1}. ID ${id} — ${count} referral${count > 1 ? 's' : ''}\n`;
            });
        } else {
            affiliateText = `1. Be the first to refer and claim the top spot!\n`;
        }

        // 2. Fetch Creator Leaderboard from Supabase with First-Come vs Volume logic
        const { data: productsData } = await supabase
            .from('products')
            .select('seller_id, created_at, profiles(username)');

        const creatorMap = {};
        if (productsData) {
            productsData.forEach(item => {
                const id = item.seller_id;
                const username = item.profiles?.username || `creator_${id}`;
                if (!creatorMap[id]) {
                    creatorMap[id] = {
                        username: username,
                        count: 0,
                        firstListed: item.created_at
                    };
                }
                creatorMap[id].count++;
                if (new Date(item.created_at) < new Date(creatorMap[id].firstListed)) {
                    creatorMap[id].firstListed = item.created_at;
                }
            });
        }

        let creatorArray = Object.values(creatorMap);
        const totalCreators = creatorArray.length;

        if (totalCreators <= 10) {
            creatorArray.sort((a, b) => new Date(a.firstListed) - new Date(b.firstListed));
        } else {
            creatorArray.sort((a, b) => b.count - a.count);
            creatorArray = creatorArray.slice(0, 10);
        }

        let creatorText = "";
        if (creatorArray.length > 0) {
            creatorArray.forEach((c, idx) => {
                creatorText += `${idx + 1}. @${c.username} — ${c.count} product${c.count > 1 ? 's' : ''}\n`;
            });
        } else {
            creatorText = `1. No product listings yet. Be among the first!\n`;
        }

        let message = `🏆 **AROVAQ Pre-Launch Network Rankings** 🏆\n\n` +
                      `👥 **Top Affiliates**\n${affiliateText}\n` +
                      `🚀 **Top Creators**\n${creatorText}\n` +
                      `💡 **Pre-Launch Note**\n15-month reward window active.\n5% foundational yield starting from listing date.\n\n` +
                      `✨ **VERIFIED VALUE.**`;

        await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (err) {
        console.error('Error in /leaderboard:', err);
        await ctx.reply('⚠️ Unable to load leaderboard right now.');
    }
});

// /categories command
bot.command('categories', async (ctx) => {
    try {
        let message = `📁 **AROVAQ Curated Categories & Drops**\n\n` +
                      `1. **Future Express: The Decentralized Age** — $8 / KES 1,040\n` +
                      `2. **Creator Economy Blueprint 2026** — $15 / KES 1,950\n\n` +
                      `🚀 Open the Mini App below to explore full collections and buy instantly!`;

        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🚀 Open Arovaq Mini App', web_app: { url: webAppUrl } }]
                ]
            }
        });
    } catch (err) {
        console.error('Error in /categories:', err);
        await ctx.reply('⚠️ Error loading categories.');
    }
});

// /list command
bot.command('list', async (ctx) => {
    await ctx.reply(
        `📦 **List Your Digital Product or Service**\n\n` +
        `To list your assets on Arovaq and secure your foundational yield, open the Mini App below.`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🚀 Open Arovaq Mini App to List', web_app: { url: webAppUrl } }]
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

// --- 5. LAUNCH BOT WITH WEBHOOK RESET ---
bot.telegram.deleteWebhook({ drop_pending_updates: true }).then(() => {
    return bot.launch();
}).then(() => {
    console.log('🤖 Arovaq Telegram Bot successfully launched and polling!');
}).catch(err => {
    console.error('Failed to launch bot:', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));