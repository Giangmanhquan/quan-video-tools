const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const app = express();

app.use(cors());
app.use(express.json());

/* HOST FILE HTML */

app.use(express.static(__dirname));

/* THƯ MỤC DOWNLOAD */

const downloadDir = path.join(
    __dirname,
    "downloads"
);

if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir);
}

/* ĐƯỜNG DẪN YT-DLP */

const YTDLP_PATH =
    process.env.YTDLP_PATH || "yt-dlp";

/* TEST SERVER */

app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "index.html")
    );
});

/* HÀM CHẠY YT-DLP */

async function runYtDlp(args) {
    return await execFileAsync(
        YTDLP_PATH,
        args,
        {
            maxBuffer:
                1024 * 1024 * 200
        }
    );
}

/* LẤY THÔNG TIN VIDEO */

app.post("/download", async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({
                error: "Thiếu URL"
            });
        }

        console.log("Đang lấy thông tin video...");

        const { stdout } = await runYtDlp([
            url,
            "--dump-single-json",
            "--no-warnings",
            "--no-check-certificates"
        ]);

        const info = JSON.parse(stdout);

        const qualities = [...new Set(
            info.formats
                .filter(f =>
                    f.height &&
                    f.vcodec !== "none"
                )
                .map(f => f.height)
        )].sort((a, b) => a - b);

        const formats = qualities.map(height => ({
            quality:
                height + "p",

            height:
                height
        }));

        console.log("Lấy thông tin thành công");

        res.json({
            title:
                info.title,

            thumbnail:
                info.thumbnail,

            videoUrl:
                url,

            formats
        });

    } catch (error) {
        console.log(
            "Lỗi lấy thông tin:",
            error
        );

        res.status(500).json({
            error:
                "Không lấy được video"
        });
    }
});

/* DOWNLOAD VIDEO */

app.get("/download-video", async (req, res) => {
    try {
        const url =
            req.query.url;

        const height =
            req.query.height || 720;

        if (!url) {
            return res.status(400).send(
                "Thiếu URL"
            );
        }

        const id =
            Date.now();

        const outputTemplate =
            path.join(
                downloadDir,
                `video-${id}.%(ext)s`
            );

        console.log("Đang tải video...");

        await runYtDlp([
            url,

            "-f",
            `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${height}][ext=mp4]/best`,

            "--merge-output-format",
            "mp4",

            "-o",
            outputTemplate,

            "--no-warnings",
            "--no-check-certificates",
            "--windows-filenames"
        ]);

        const files =
            fs.readdirSync(downloadDir);

        const videoFile =
            files.find(file =>
                file.startsWith(`video-${id}`) &&
                file.endsWith(".mp4")
            );

        if (!videoFile) {
            console.log("Không tìm thấy file MP4");

            return res.status(500).send(
                "Không tạo được video. Kiểm tra FFmpeg hoặc yt-dlp."
            );
        }

        const filePath =
            path.join(downloadDir, videoFile);

        console.log(
            "Đã tạo xong:",
            filePath
        );

        res.download(
            filePath,
            "video.mp4",
            err => {
                if (err) {
                    console.log(
                        "Lỗi gửi file:",
                        err
                    );
                }
            }
        );

    } catch (error) {
        console.log(
            "Lỗi tải video:",
            error
        );

        res.status(500).send(
            "Lỗi tải video"
        );
    }
});

/* DOWNLOAD MP3 */

app.get("/download-mp3", async (req, res) => {
    try {
        const url =
            req.query.url;

        if (!url) {
            return res.status(400).send(
                "Thiếu URL"
            );
        }

        const id =
            Date.now();

        const outputTemplate =
            path.join(
                downloadDir,
                `audio-${id}.%(ext)s`
            );

        console.log("Đang tải MP3...");

        await runYtDlp([
            url,

            "-x",

            "--audio-format",
            "mp3",

            "--audio-quality",
            "0",

            "-o",
            outputTemplate,

            "--no-warnings",
            "--no-check-certificates",
            "--windows-filenames"
        ]);

        const files =
            fs.readdirSync(downloadDir);

        const audioFile =
            files.find(file =>
                file.startsWith(`audio-${id}`) &&
                file.endsWith(".mp3")
            );

        if (!audioFile) {
            return res.status(500).send(
                "Không tạo được MP3"
            );
        }

        const filePath =
            path.join(downloadDir, audioFile);

        console.log(
            "Đã tạo MP3:",
            filePath
        );

        res.download(
            filePath,
            "audio.mp3",
            err => {
                if (err) {
                    console.log(
                        "Lỗi gửi MP3:",
                        err
                    );
                }
            }
        );

    } catch (error) {
        console.log(
            "Lỗi tải MP3:",
            error
        );

        res.status(500).send(
            "Lỗi tải MP3"
        );
    }
});

/* START SERVER */

const PORT =
    process.env.PORT || 3000;

app.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `Server chạy tại port ${PORT}`
        );
    }
);