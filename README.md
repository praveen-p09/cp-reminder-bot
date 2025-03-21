# AlgoAlarm - Contest Reminder Telegram Bot ⏰

**AlgoAlarm** is a powerful **Telegram bot** that keeps you updated on upcoming **Competitive Programming (CP) contests** from platforms like **Codeforces, CodeChef, LeetCode, AtCoder, GeeksforGeeks, etc.** It ensures you **never miss** an important contest by sending **timely reminders** to individuals and Telegram groups.

📢 **Try it out:** [@Code_Reminder_Bot](https://t.me/Code_Reminder_Bot)

---

## 🔥 Features

✅ **Automated Contest Reminders**

- Sends **two reminders** before each contest:
  - ⏳ **24 hours before**
  - 🔥 **1 hour before**

✅ **Supported Coding Platforms**

- Codeforces
- CodeChef
- LeetCode
- AtCoder
- GeeksforGeeks
- (More can be added!)

✅ **User & Group Friendly**

- Works for **individuals** and can be **added to Telegram groups** for **programming clubs**.

✅ **Timezone Support**

- Users can configure their **timezone** for accurate contest start times.

✅ **Simple Commands**  
| Command | Description |
|----------------|-------------|
| `/start` | Start the bot and get usage instructions |
| `/subscribe` | Start receiving contest reminders |
| `/unsubscribe` | Stop receiving contest reminders |
| `/settimezone` | Set your timezone using [TZ identifier](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) (e.g., `/settimezone Asia/Kolkata`) |

---

## 🛠️ Tech Stack

- **Backend:** Node.js
- **Database:** Supabase (PostgreSQL)
- **API:** [CList API](https://clist.by) for contest data
- **Bot Framework:** node-telegram-bot-api
- **Scheduler:** node-schedule
- **Hosting:** Render

---

## 📈 Scalability & System Design

### **1️⃣ Webhook-Based Communication**

- Uses **Telegram Webhooks** instead of polling for **faster responses** and **lower resource consumption**.

### **2️⃣ PostgreSQL for Efficient Data Storage**

- Uses **Supabase (PostgreSQL)** to store user subscriptions, timezones, and sent reminders.
- Indexes optimize **query performance** when checking reminders.

### **3️⃣ Rate-Limiting & Deduplication**

- Stores sent reminders in the database to prevent **duplicate notifications**.

### **4️⃣ Scheduled Jobs for Efficiency**

- A **cron job** runs every **10 minutes** to:
  - Fetch upcoming contests
  - Send reminders to subscribed users
  - Delete expired contest entries

---

## 🚀 How to Deploy

1️⃣ Clone the repo:

```bash
git clone https://github.com/praveen-p09/cp-reminder-bot.git
cd cp-reminder-bot
```

2️⃣ Install dependencies:

```bash
npm install
```

3️⃣ Set up **.env** file with credentials:

```ini
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-supabase-key
CLIST_USERNAME=your-clist-username
CLIST_API_KEY=your-clist-api-key
SERVER_URL=https://your-deployed-url.com
SET_WEBHOOK=true
```

4️⃣ Start the bot:

```bash
node bot.js
```

---

## 🎯 Future Enhancements

✅ More CP platforms (HackerRank, TopCoder, etc.)  
✅ Customizable reminder times  
✅ User leaderboard & profile tracking

---

## 👨‍💻 Creator

Built with ❤️ by **[Praveen Patro](https://www.linkedin.com/in/praveen-chandra-patro-1a6a5a257)**

Happy coding! 🚀
