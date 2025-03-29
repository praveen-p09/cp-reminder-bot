import TelegramBot from "node-telegram-bot-api";
import dotenv, { parse } from "dotenv";
import schedule from "node-schedule";
import axios from "axios";
import express from "express";
import { DateTime } from "luxon";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { webHook: true });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const setWebhook = async () => {
  const webhookURL = `${process.env.SERVER_URL}/bot${process.env.TELEGRAM_BOT_TOKEN}`;
  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/setWebhook`,
      { url: webhookURL, max_connections: 100 }
    );
    console.log("✅ Webhook set:", response.data);
  } catch (error) {
    console.error("❌ Error setting webhook:", error?.response?.data ?? error);
  }
};

if (process.env.SET_WEBHOOK === "true") {
  setWebhook();
}

app.use(express.raw({ type: "application/json" }));

app.post(`/bot${process.env.TELEGRAM_BOT_TOKEN}`, async (req, res) => {
  try {
    const update = JSON.parse(req.body.toString());
    await bot.processUpdate(update);
    res.sendStatus(200);
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(400).send("Invalid request");
  }
});

app.get("/", (_, res) => res.send("Bot is running!"));

app.listen(port, () => console.log(`🚀 Server running on port ${port}`));

const ALLOWED_HOSTS = [
  "atcoder.jp",
  "codeforces.com",
  "codechef.com",
  "leetcode.com",
  "geeksforgeeks.org",
  // "facebook.com/hackercup",
  // "hackerearth.com",
  // "hackerrank.com",
  // "topcoder.com",
  // "naukri.com/code360",
  // "luogu.com.cn",
];

const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);
const getPlatformName = (host) => capitalize(host.split(".")[0]);
const escapeMarkdownV2 = (text) =>
  text.replace(/([_*[\]()~`>#+-=|{}.!])/g, "\\$1");

// Fetch contest data from CList API
let contestCache = null;
let lastFetchTime = 0;
const fetchInterval = 12 * 60 * 60 * 1000; // 12 hours
const fetchContests = async () => {
  const currentTime = DateTime.utc().toMillis();
  if (contestCache && currentTime - lastFetchTime < fetchInterval) {
    return contestCache;
  }
  try {
    console.log("Fetching contests from CList API...");
    const response = await axios.get(`https://clist.by/api/v4/json/contest/`, {
      params: {
        username: process.env.CLIST_USERNAME,
        api_key: process.env.CLIST_API_KEY,
        upcoming: "true",
        order_by: "start",
        limit: 100,
        host__regex: ALLOWED_HOSTS.join("|"),
      },
    });
    contestCache = response.data.objects;
    lastFetchTime = currentTime;
    return contestCache;
  } catch (error) {
    console.error("Error fetching contests:", error);
    return [];
  }
};

// Fetch user subscriptions from database
const getUserSubscriptions = async () => {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("chat_id, timezone");
  if (error) {
    console.error("Error fetching subscriptions:", error);
    return [];
  }
  return data;
};

// Store or update user timezone in database
const setUserTimezone = async (chatId, timezone) => {
  await supabase
    .from("subscriptions")
    .upsert({ chat_id: chatId, timezone }, { onConflict: "chat_id" });
};

// Store subscription in database
const addSubscription = async (chatId) => {
  await supabase
    .from("subscriptions")
    .upsert({ chat_id: chatId }, { onConflict: ["chat_id"] });
};

// Remove subscription from database
const removeSubscription = async (chatId) => {
  await supabase.from("subscriptions").delete().match({ chat_id: chatId });
};

// Store sent reminders to prevent duplicate alerts for same contest
const storeSentReminders = async (reminders) => {
  if (reminders.length === 0) return;
  const { error } = await supabase.from("sent_reminders").insert(reminders);

  if (error) {
    console.error("❌ Error storing reminder:", error);
  } else {
    console.log(`✅ Stored ${reminders.length} reminders successfully!`);
  }
};

// Check if contest reminder was already sent
// const wasReminderSent = async (
//   chatId,
//   contestId,
//   reminderType,
//   contestStart,
//   host
// ) => {
//   const { data, error } = await supabase
//     .from("sent_reminders")
//     .select("id")
//     .eq("chat_id", chatId)
//     .eq("contest_id", contestId)
//     .eq("reminder_type", reminderType)
//     .eq("contest_start", contestStart)
//     .eq("host", host);

//   if (error) {
//     console.error("❌ Error checking sent reminder:", error);
//     return false;
//   }

//   return data.length > 0;
// };

// Delete expired contests from database
const deleteExpiredContests = async () => {
  const now = DateTime.utc().toISO({ suppressMilliseconds: true });
  const oneHourLater = DateTime.utc()
    .plus({ hours: 1 })
    .toISO({ suppressMilliseconds: true });

  // Delete '24hr' reminders where contest_start is within the next 1 hour
  const { error: error24hr } = await supabase
    .from("sent_reminders")
    .delete()
    .lt("contest_start", oneHourLater)
    .eq("reminder_type", "24hr");

  if (error24hr) {
    console.error("Error deleting 24hr reminders:", error24hr);
  } else {
    console.log(
      "✅ 24hr reminders removed where contest_start is within 1 hour."
    );
  }

  // Delete '1hr' reminders where contest_start has already passed
  const { error: error1hr } = await supabase
    .from("sent_reminders")
    .delete()
    .lt("contest_start", now)
    .eq("reminder_type", "1hr");

  if (error1hr) {
    console.error("Error deleting 1hr reminders:", error1hr);
  } else {
    console.log("✅ 1hr reminders removed where contest has already started.");
  }
};

// Command: Start
bot.onText(/\/start/, (msg) => {
  const username = msg.from.username || msg.from.first_name || "User";
  const usernameEscaped = escapeMarkdownV2(username);

  bot.sendMessage(
    msg.chat.id,
    `👋 Hello, ${usernameEscaped}\\!\n\n` +
      `I'm *CP Reminder Bot*, your personal assistant for staying updated with upcoming coding contests\\! 🚀\n\n` +
      `  *What I Do\\?*\n` +
      `1️⃣ Send timely reminders for competitive programming contests\\.\n` +
      `2️⃣ Support platforms like Codeforces, AtCoder, LeetCode, CodeChef, and more\\.\n` +
      `3️⃣ Allow timezone customization to match your local time\\.\n\n` +
      `  *How to Use\\?*\n` +
      `  ✅ Use \`/subscribe\` to start receiving contest reminders\\.\n` +
      `  🌍 Use \`/settimezone TZ\\_Identifier\` to configure your timezone\\.\n` +
      `  ❌ Use \`/unsubscribe\` to stop receiving reminders\\.\n\n` +
      `🛠️ Created by [Praveen Patro](https://www.linkedin.com/in/praveen-chandra-patro-1a6a5a257)\n\n` +
      `Happy Coding\\! 🚀`,
    {
      parse_mode: "MarkdownV2",
    }
  );
});

// Command: Subscribe
bot.onText(/\/subscribe/, async (msg) => {
  await addSubscription(msg.chat.id);
  bot.sendMessage(
    msg.chat.id,
    "✅ Subscribed! You'll receive contest reminders."
  );
});

// Command: Unsubscribe
bot.onText(/\/unsubscribe/, async (msg) => {
  await removeSubscription(msg.chat.id);
  bot.sendMessage(msg.chat.id, "❌ Unsubscribed! You won't receive reminders.");
});

// Command: Set Timezone
bot.onText(/\/settimezone (.+)/, async (msg, match) => {
  const timezone = match[1].trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    await setUserTimezone(msg.chat.id, timezone);
    bot.sendMessage(
      msg.chat.id,
      `🌍 Timezone set to *${escapeMarkdownV2(timezone)}*`,
      { parse_mode: "MarkdownV2" }
    );
  } catch {
    bot.sendMessage(
      msg.chat.id,
      "⚠️ Invalid timezone. Use a valid identifier."
    );
  }
});

// Enable command suggestions
bot.setMyCommands([
  { command: "start", description: "Start the bot" },
  { command: "subscribe", description: "Subscribe to contest reminders" },
  { command: "unsubscribe", description: "Unsubscribe from contest reminders" },
  {
    command: "settimezone",
    description: "Set your timezone using TZ identifier(eg: Asia/Kolkata)",
  },
]);

// Schedule Job every 10 minutes : send reminders and delete expired contests
schedule.scheduleJob("*/10 * * * *", async () => {
  console.log(
    "🔄 Running scheduled job: Sending reminders & deleting expired contests"
  );

  await deleteExpiredContests();

  const contests = await fetchContests();
  if (contests.length === 0) {
    console.log("No upcoming contests found.");
    return;
  }
  const subscribers = await getUserSubscriptions();

  const { data: sentReminders, error } = await supabase
    .from("sent_reminders")
    .select("id");
  if (error || !sentReminders) {
    console.error("Error fetching sent reminders:", error);
    return;
  }
  const sentRemindersSet = new Set(
    sentReminders.map((reminder) => reminder.id)
  );
  const remindersToStore = [];

  for (const { chat_id, timezone } of subscribers) {
    for (const contest of contests) {
      const contestId = contest.id;
      const contestStart = DateTime.fromISO(contest.start, {
        zone: "utc",
      }).setZone(timezone);
      const hoursLeft = contestStart.diff(DateTime.utc(), "hours").hours;
      const hostName = getPlatformName(contest.host);
      const reminder24hrId = `${chat_id}-${hostName}-${contestId}-24hr`;
      const reminder1hrId = `${chat_id}-${hostName}-${contestId}-1hr`;

      if (
        hoursLeft <= 24 &&
        hoursLeft > 1 &&
        !sentRemindersSet.has(reminder24hrId)
      ) {
        remindersToStore.push({
          chat_id,
          contest_id: contestId,
          reminder_type: "24hr",
          contest_start: contest.start,
          host: hostName,
        });
        bot.sendMessage(
          chat_id,
          `⏳ *Reminder:* Contest within 24 hours\\!\n${formatContestMessage(
            contest,
            timezone
          )}`,
          { parse_mode: "MarkdownV2" }
        );
      }

      if (hoursLeft <= 1 && !sentRemindersSet.has(reminder1hrId)) {
        remindersToStore.push({
          chat_id,
          contest_id: contestId,
          reminder_type: "1hr",
          contest_start: contest.start,
          host: hostName,
        });
        bot.sendMessage(
          chat_id,
          `🔥 *Reminder:* Contest starts within an hour\\!\n${formatContestMessage(
            contest,
            timezone
          )}`,
          { parse_mode: "MarkdownV2" }
        );
      }
    }
  }
  await storeSentReminders(remindersToStore);
});

// format contest message with timezone conversion
const formatContestMessage = (contest, timezone) => {
  const startTime = escapeMarkdownV2(
    DateTime.fromISO(contest.start, { zone: "utc" })
      .setZone(timezone)
      .toFormat("d LLLL yyyy  h:mm a (z)")
  );

  const endTime = escapeMarkdownV2(
    DateTime.fromISO(contest.end, { zone: "utc" })
      .setZone(timezone)
      .toFormat("d LLLL yyyy  h:mm a (z)")
  );

  const hours = Math.floor(contest.duration / 3600);
  const minutes = Math.round((contest.duration % 3600) / 60);
  return (
    `📢 *${escapeMarkdownV2(contest.event)}*\n` +
    `🌐 *Platform:* ${escapeMarkdownV2(getPlatformName(contest.host))}\n` +
    `⏳ *Duration:* ${escapeMarkdownV2(`${hours} hr ${minutes} min`)}\n` +
    `🕒 *Start:* ${startTime}\n` +
    `🕒 *End:* ${endTime}\n` +
    `🔗 *Join Here:* [Click Here](${escapeMarkdownV2(contest.href)})`
  );
};
