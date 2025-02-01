const axios = require("axios");
const fs = require("fs");
const yts = require("yt-search");
const path = require("path");
const cacheDir = path.join(__dirname, "/cache");

module.exports = {
  config: {
    name: "sing",
    version: "1.2",
    aliases: [],
    author: "Team X",
    countDown: 5,
    role: 0,
    description: {
      en: "Search and download audio from YouTube",
    },
    category: "media",
    guide: {
      en: "{pn} <search term>: search YouTube and download selected audio",
    },
  },

  onStart: async ({ api, args, event }) => {
    if (args.length < 1) {
      return api.sendMessage("❌ Please use the format '/sing <search term>'.", event.threadID, event.messageID);
    }

    const searchTerm = args.join(" ");
    api.setMessageReaction("⏳", event.messageID, () => {}, true);

    try {
      const searchResults = await yts(searchTerm);
      const topVideo = searchResults.videos[0];

      if (!topVideo) {
        api.setMessageReaction("❌", event.messageID, () => {}, true);
        return api.sendMessage(`🔍 No results found for: ${searchTerm}`, event.threadID, event.messageID);
      }

      const videoUrl = topVideo.url;
      try {
        const downloadUrlEndpoint = `http://152.42.220.111:25744/allLink?link=${encodeURIComponent(videoUrl)}`;
        const respo = await axios.get(downloadUrlEndpoint);
        const downloadUrl = respo.data.download_url;

        if (!downloadUrl) {
          api.setMessageReaction("❌", event.messageID, () => {}, true);
          return api.sendMessage("❌ Could not retrieve an MP3 file. Please try again with a different search.", event.threadID, event.messageID);
        }

        const totalSize = await getTotalSize(downloadUrl);
        const audioPath = path.join(cacheDir, `ytb_audio_${topVideo.videoId}.mp3`);
        await downloadFileParallel(downloadUrl, audioPath, totalSize, 5);

        api.setMessageReaction("✅", event.messageID, () => {}, true);
        await api.sendMessage(
          {
            body: `📥 Audio download successful:\n• Title: ${topVideo.title}\n• Channel: ${topVideo.author.name}`,
            attachment: fs.createReadStream(audioPath),
          },
          event.threadID,
          () => fs.unlinkSync(audioPath),
          event.messageID
        );
      } catch (e) {
        api.setMessageReaction("❌", event.messageID, () => {}, true);
        console.error(e);
        return api.sendMessage("❌ Failed to download.", event.threadID, event.messageID);
      }
    } catch (error) {
      api.setMessageReaction("❌", event.messageID, () => {}, true);
      console.error(error);
      return api.sendMessage("❌ Failed to search YouTube.", event.threadID, event.messageID);
    }
  },
};

async function getTotalSize(url) {
  const response = await axios.head(url);
  return parseInt(response.headers["content-length"], 10);
}

async function downloadFileParallel(url, filePath, totalSize, numChunks) {
  const chunkSize = Math.ceil(totalSize / numChunks);
  const chunks = [];
  const progress = Array(numChunks).fill(0);

  async function downloadChunk(url, start, end, index) {
    try {
      const response = await axios.get(url, {
        headers: { Range: `bytes=${start}-${end}` },
        responseType: "arraybuffer",
        timeout: 15000,
      });

      progress[index] = response.data.byteLength;
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  for (let i = 0; i < numChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize - 1, totalSize - 1);
    chunks.push(downloadChunk(url, start, end, i));
  }

  try {
    const buffers = await Promise.all(chunks);

    const fileStream = fs.createWriteStream(filePath);
    for (const buffer of buffers) {
      fileStream.write(Buffer.from(buffer));
    }

    await new Promise((resolve, reject) => {
      fileStream.on("finish", resolve);
      fileStream.on("error", reject);
      fileStream.end();
    });
  } catch (error) {
    console.error("Error downloading or writing the file:", error);
  }
      }
