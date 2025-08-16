const { Client, GatewayIntentBits } = require("discord.js");
const { DisTube } = require("distube");
const { SpotifyPlugin } = require("@distube/spotify");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.distube = new DisTube(client, {
  leaveOnEmpty: true,
  leaveOnFinish: false,
  leaveOnStop: false,
  plugins: [new SpotifyPlugin()],
});

const PREFIX = process.env.PREFIX || "!";
client.on("ready", () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
});

// Comandos
client.on("messageCreate", async (message) => {
  if (!message.content.startsWith(PREFIX) || message.author.bot) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === "play") {
    client.distube.play(message.member.voice.channel, args.join(" "), {
      message,
      textChannel: message.channel,
      member: message.member,
    });
  }

  if (command === "skip") client.distube.skip(message);
  if (command === "stop") client.distube.stop(message);

  if (command === "np") {
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send("❌ No hay canciones en cola.");
    message.channel.send(`🎶 Reproduciendo: **${queue.songs[0].name}**`);
  }

  if (command === "queue") {
    const queue = client.distube.getQueue(message);
    if (!queue) return message.channel.send("❌ No hay canciones en cola.");
    message.channel.send(
      "📜 **Cola actual:**\n" +
        queue.songs
          .map((song, id) => `**${id === 0 ? "Reproduciendo" : id}**. ${song.name}`)
          .join("\n")
    );
  }
});

// Eventos de música
client.distube
  .on("playSong", (queue, song) =>
    queue.textChannel.send(`🎶 Reproduciendo: **${song.name}**`)
  )
  .on("addSong", (queue, song) =>
    queue.textChannel.send(`➕ Agregada: **${song.name}**`)
  );

client.login(process.env.DISCORD_TOKEN);
