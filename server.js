require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");
const OpenAI = require("openai");

const execFileAsync = promisify(execFile);

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const uploadDir = path.join(__dirname, "uploads");
const outputDir = path.join(__dirname, "downloads");

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

const AI_MODEL =
    process.env.OPENAI_MODEL || "gpt-5.2";

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),

    filename: (req, file, cb) => {
        const safeName =
            file.originalname.replace(/\s+/g, "-");

        cb(
            null,
            Date.now() + "-" + safeName
        );
    }
});

const upload = multer({
    storage,

    limits: {
        fileSize: 500 * 1024 * 1024
    },

    fileFilter: (req, file, cb) => {
        const ok =
            file.mimetype.startsWith("video/") ||
            file.mimetype.startsWith("audio/") ||
            file.mimetype.startsWith("image/");

        if (!ok) {
            return cb(
                new Error(
                    "Chỉ cho phép upload video, audio hoặc ảnh"
                )
            );
        }

        cb(null, true);
    }
});

function deleteFile(filePath) {
    if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

function makeOutputName(prefix, ext) {
    return `${prefix}-${Date.now()}.${ext}`;
}

function getDownloadUrl(filename) {
    return `/download/${filename}`;
}

async function runFFmpeg(args) {
    await execFileAsync("ffmpeg", args, {
        maxBuffer: 1024 * 1024 * 200
    });
}

function getVideoFile(req) {
    if (req.file) return req.file;
    if (req.files && req.files.video) return req.files.video[0];
    return null;
}

function getAudioFile(req) {
    if (req.files && req.files.audio) return req.files.audio[0];
    return null;
}

function getImageFile(req) {
    if (req.files && req.files.image) return req.files.image[0];
    return null;
}

function safeText(text) {
    return String(text || "")
        .replace(/\\/g, "\\\\")
        .replace(/:/g, "\\:")
        .replace(/'/g, "\\'");
}

function getWatermarkPosition(position) {
    const positions = {
        "top-left": "x=20:y=20",
        "top-right": "x=w-tw-20:y=20",
        "bottom-left": "x=20:y=h-th-20",
        "bottom-right": "x=w-tw-20:y=h-th-20",
        "center": "x=(w-tw)/2:y=(h-th)/2"
    };

    return positions[position] || positions["bottom-right"];
}

app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "index.html")
    );
});

/* AI CREATOR TOOLS */

app.post("/ai-caption", async (req, res) => {
    try {
        const {
            topic,
            platform,
            style
        } = req.body;

        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({
                error: "Server chưa cấu hình OPENAI_API_KEY"
            });
        }

        if (!topic || topic.trim() === "") {
            return res.status(400).json({
                error: "Bạn chưa nhập nội dung video"
            });
        }

        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        const prompt = `
Bạn là chuyên gia sáng tạo nội dung video ngắn cho TikTok, YouTube Shorts, Facebook Reels và Instagram Reels.

Thông tin video:
- Chủ đề video: ${topic}
- Nền tảng: ${platform || "TikTok"}
- Phong cách: ${style || "viral, tự nhiên, dễ lên xu hướng"}

Hãy trả lời bằng tiếng Việt, rõ ràng, dễ copy, gồm các phần sau:

1. Caption ngắn:
- Viết 10 caption ngắn, cuốn hút, hợp video ngắn.

2. Hook mở đầu video:
- Viết 10 câu mở đầu gây tò mò trong 1-2 giây đầu.

3. Hashtag:
- Viết 15 hashtag phù hợp, không spam quá mức.

4. Tiêu đề video:
- Viết 10 tiêu đề ngắn cho video.

5. Mô tả video:
- Viết 5 mô tả ngắn phù hợp để đăng mạng xã hội.

Yêu cầu:
- Ngôn ngữ tự nhiên, đúng vibe creator/editor.
- Câu ngắn, dễ đọc, dễ dùng.
- Không dùng nội dung phản cảm.
- Không nhắc rằng bạn là AI.
`;

        const response =
            await openai.responses.create({
                model: AI_MODEL,
                input: prompt
            });

        res.json({
            success: true,
            result: response.output_text
        });

    } catch (error) {
        console.log("Lỗi AI:", error.message);
console.log(error);

        res.status(500).json({
            error: "Lỗi tạo nội dung AI"
        });
    }
});

/* 1. CHUYỂN VIDEO SANG MP3 */

app.post("/convert-mp3", upload.single("video"), async (req, res) => {
    try {
        const video = getVideoFile(req);

        if (!video) {
            return res.status(400).json({
                error: "Bạn chưa upload video"
            });
        }

        const outputName =
            makeOutputName("audio", "mp3");

        const outputPath =
            path.join(outputDir, outputName);

        await runFFmpeg([
            "-i", video.path,
            "-vn",
            "-ar", "44100",
            "-ac", "2",
            "-b:a", "192k",
            outputPath
        ]);

        deleteFile(video.path);

        res.json({
            success: true,
            message: "Chuyển MP3 thành công",
            downloadUrl: getDownloadUrl(outputName)
        });

    } catch (error) {
        console.log("Lỗi chuyển MP3:", error);

        if (req.file) {
            deleteFile(req.file.path);
        }

        res.status(500).json({
            error: "Lỗi chuyển video sang MP3"
        });
    }
});

/* 2. TÁCH ÂM THANH KHỎI VIDEO */

app.post("/extract-audio", upload.single("video"), async (req, res) => {
    try {
        const video = getVideoFile(req);

        if (!video) {
            return res.status(400).json({
                error: "Bạn chưa upload video"
            });
        }

        const outputName =
            makeOutputName("extracted-audio", "m4a");

        const outputPath =
            path.join(outputDir, outputName);

        await runFFmpeg([
            "-i", video.path,
            "-vn",
            "-c:a", "aac",
            "-b:a", "192k",
            outputPath
        ]);

        deleteFile(video.path);

        res.json({
            success: true,
            message: "Tách âm thanh thành công",
            downloadUrl: getDownloadUrl(outputName)
        });

    } catch (error) {
        console.log("Lỗi tách âm thanh:", error);

        if (req.file) {
            deleteFile(req.file.path);
        }

        res.status(500).json({
            error: "Lỗi tách âm thanh khỏi video"
        });
    }
});

/* 3. NÉN VIDEO */

app.post("/compress-video", upload.single("video"), async (req, res) => {
    try {
        const video = getVideoFile(req);

        if (!video) {
            return res.status(400).json({
                error: "Bạn chưa upload video"
            });
        }

        const outputName =
            makeOutputName("compressed", "mp4");

        const outputPath =
            path.join(outputDir, outputName);

        await runFFmpeg([
            "-i", video.path,
            "-vcodec", "libx264",
            "-crf", "28",
            "-preset", "veryfast",
            "-acodec", "aac",
            "-b:a", "128k",
            outputPath
        ]);

        deleteFile(video.path);

        res.json({
            success: true,
            message: "Nén video thành công",
            downloadUrl: getDownloadUrl(outputName)
        });

    } catch (error) {
        console.log("Lỗi nén video:", error);

        if (req.file) {
            deleteFile(req.file.path);
        }

        res.status(500).json({
            error: "Lỗi nén video"
        });
    }
});

/* 4. CẮT VIDEO */

app.post("/cut-video", upload.single("video"), async (req, res) => {
    try {
        const video = getVideoFile(req);

        const start =
            req.body.start || "00:00:00";

        const end =
            req.body.end || "00:00:10";

        if (!video) {
            return res.status(400).json({
                error: "Bạn chưa upload video"
            });
        }

        const outputName =
            makeOutputName("cut", "mp4");

        const outputPath =
            path.join(outputDir, outputName);

        await runFFmpeg([
            "-i", video.path,
            "-ss", start,
            "-to", end,
            "-c", "copy",
            outputPath
        ]);

        deleteFile(video.path);

        res.json({
            success: true,
            message: "Cắt video thành công",
            downloadUrl: getDownloadUrl(outputName)
        });

    } catch (error) {
        console.log("Lỗi cắt video:", error);

        if (req.file) {
            deleteFile(req.file.path);
        }

        res.status(500).json({
            error: "Lỗi cắt video"
        });
    }
});

/* 5. RESIZE VIDEO */

app.post("/resize-video", upload.single("video"), async (req, res) => {
    try {
        const video = getVideoFile(req);

        const ratio =
            req.body.ratio || "9:16";

        if (!video) {
            return res.status(400).json({
                error: "Bạn chưa upload video"
            });
        }

        const sizes = {
            "9:16": "1080:1920",
            "16:9": "1920:1080",
            "1:1": "1080:1080",
            "4:5": "1080:1350"
        };

        const target =
            sizes[ratio] || sizes["9:16"];

        const [w, h] =
            target.split(":");

        const filter =
            `scale=${w}:${h}:force_original_aspect_ratio=decrease,` +
            `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`;

        const outputName =
            makeOutputName("resized", "mp4");

        const outputPath =
            path.join(outputDir, outputName);

        await runFFmpeg([
            "-i", video.path,
            "-vf", filter,
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "23",
            "-c:a", "aac",
            "-b:a", "128k",
            outputPath
        ]);

        deleteFile(video.path);

        res.json({
            success: true,
            message: `Resize video ${ratio} thành công`,
            downloadUrl: getDownloadUrl(outputName)
        });

    } catch (error) {
        console.log("Lỗi resize video:", error);

        if (req.file) {
            deleteFile(req.file.path);
        }

        res.status(500).json({
            error: "Lỗi resize video"
        });
    }
});

/* 6. TẠO THUMBNAIL */

app.post("/thumbnail-video", upload.single("video"), async (req, res) => {
    try {
        const video = getVideoFile(req);

        const time =
            req.body.time || "00:00:03";

        if (!video) {
            return res.status(400).json({
                error: "Bạn chưa upload video"
            });
        }

        const outputName =
            makeOutputName("thumbnail", "jpg");

        const outputPath =
            path.join(outputDir, outputName);

        await runFFmpeg([
            "-ss", time,
            "-i", video.path,
            "-frames:v", "1",
            "-q:v", "2",
            outputPath
        ]);

        deleteFile(video.path);

        res.json({
            success: true,
            message: "Tạo thumbnail thành công",
            downloadUrl: getDownloadUrl(outputName)
        });

    } catch (error) {
        console.log("Lỗi tạo thumbnail:", error);

        if (req.file) {
            deleteFile(req.file.path);
        }

        res.status(500).json({
            error: "Lỗi tạo thumbnail"
        });
    }
});

/* 7. TẮT ÂM THANH VIDEO */

app.post("/mute-video", upload.single("video"), async (req, res) => {
    try {
        const video = getVideoFile(req);

        if (!video) {
            return res.status(400).json({
                error: "Bạn chưa upload video"
            });
        }

        const outputName =
            makeOutputName("muted", "mp4");

        const outputPath =
            path.join(outputDir, outputName);

        await runFFmpeg([
            "-i", video.path,
            "-c:v", "copy",
            "-an",
            outputPath
        ]);

        deleteFile(video.path);

        res.json({
            success: true,
            message: "Tắt âm thanh video thành công",
            downloadUrl: getDownloadUrl(outputName)
        });

    } catch (error) {
        console.log("Lỗi tắt âm thanh:", error);

        if (req.file) {
            deleteFile(req.file.path);
        }

        res.status(500).json({
            error: "Lỗi tắt âm thanh video"
        });
    }
});

/* 8. TĂNG / GIẢM ÂM LƯỢNG */

app.post("/volume-video", upload.single("video"), async (req, res) => {
    try {
        const video = getVideoFile(req);

        const volume =
            req.body.volume || "1.5";

        if (!video) {
            return res.status(400).json({
                error: "Bạn chưa upload video"
            });
        }

        const outputName =
            makeOutputName("volume", "mp4");

        const outputPath =
            path.join(outputDir, outputName);

        await runFFmpeg([
            "-i", video.path,
            "-filter:a", `volume=${volume}`,
            "-c:v", "copy",
            outputPath
        ]);

        deleteFile(video.path);

        res.json({
            success: true,
            message: "Điều chỉnh âm lượng thành công",
            downloadUrl: getDownloadUrl(outputName)
        });

    } catch (error) {
        console.log("Lỗi âm lượng:", error);

        if (req.file) {
            deleteFile(req.file.path);
        }

        res.status(500).json({
            error: "Lỗi điều chỉnh âm lượng"
        });
    }
});

/* 9. GHÉP NHẠC VÀO VIDEO */

app.post(
    "/replace-audio",
    upload.fields([
        { name: "video", maxCount: 1 },
        { name: "audio", maxCount: 1 }
    ]),
    async (req, res) => {
        try {
            const video = getVideoFile(req);
            const audio = getAudioFile(req);

            if (!video || !audio) {
                return res.status(400).json({
                    error: "Bạn cần upload cả video và file nhạc"
                });
            }

            const outputName =
                makeOutputName("music-video", "mp4");

            const outputPath =
                path.join(outputDir, outputName);

            await runFFmpeg([
                "-i", video.path,
                "-i", audio.path,
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-c:v", "copy",
                "-c:a", "aac",
                "-shortest",
                outputPath
            ]);

            deleteFile(video.path);
            deleteFile(audio.path);

            res.json({
                success: true,
                message: "Ghép nhạc vào video thành công",
                downloadUrl: getDownloadUrl(outputName)
            });

        } catch (error) {
            console.log("Lỗi ghép nhạc:", error);

            if (req.files?.video) {
                deleteFile(req.files.video[0].path);
            }

            if (req.files?.audio) {
                deleteFile(req.files.audio[0].path);
            }

            res.status(500).json({
                error: "Lỗi ghép nhạc vào video"
            });
        }
    }
);

/* 10. TĂNG TỐC / LÀM CHẬM VIDEO */

app.post("/speed-video", upload.single("video"), async (req, res) => {
    try {
        const video = getVideoFile(req);

        const speed =
            Number(req.body.speed || 1);

        if (!video) {
            return res.status(400).json({
                error: "Bạn chưa upload video"
            });
        }

        if (speed < 0.5 || speed > 2) {
            deleteFile(video.path);

            return res.status(400).json({
                error: "Tốc độ chỉ hỗ trợ từ 0.5x đến 2x"
            });
        }

        const outputName =
            makeOutputName("speed", "mp4");

        const outputPath =
            path.join(outputDir, outputName);

        await runFFmpeg([
            "-i", video.path,
            "-filter_complex",
            `[0:v]setpts=PTS/${speed}[v];[0:a]atempo=${speed}[a]`,
            "-map", "[v]",
            "-map", "[a]",
            outputPath
        ]);

        deleteFile(video.path);

        res.json({
            success: true,
            message: `Đổi tốc độ ${speed}x thành công`,
            downloadUrl: getDownloadUrl(outputName)
        });

    } catch (error) {
        console.log("Lỗi đổi tốc độ:", error);

        if (req.file) {
            deleteFile(req.file.path);
        }

        res.status(500).json({
            error: "Lỗi tăng tốc / làm chậm video"
        });
    }
});

/* 11. XOAY / LẬT VIDEO */

app.post("/rotate-video", upload.single("video"), async (req, res) => {
    try {
        const video = getVideoFile(req);

        const mode =
            req.body.mode || "right";

        if (!video) {
            return res.status(400).json({
                error: "Bạn chưa upload video"
            });
        }

        const filters = {
            right: "transpose=1",
            left: "transpose=2",
            hflip: "hflip",
            vflip: "vflip"
        };

        const filter =
            filters[mode] || filters.right;

        const outputName =
            makeOutputName("rotate", "mp4");

        const outputPath =
            path.join(outputDir, outputName);

        await runFFmpeg([
            "-i", video.path,
            "-vf", filter,
            "-c:a", "copy",
            outputPath
        ]);

        deleteFile(video.path);

        res.json({
            success: true,
            message: "Xoay / lật video thành công",
            downloadUrl: getDownloadUrl(outputName)
        });

    } catch (error) {
        console.log("Lỗi xoay video:", error);

        if (req.file) {
            deleteFile(req.file.path);
        }

        res.status(500).json({
            error: "Lỗi xoay / lật video"
        });
    }
});

/* 12. THÊM WATERMARK CHỮ */

app.post("/watermark-video", upload.single("video"), async (req, res) => {
    try {
        const video = getVideoFile(req);

        const text =
            safeText(req.body.text || "@QuanEdit");

        const position =
            req.body.position || "bottom-right";

        if (!video) {
            return res.status(400).json({
                error: "Bạn chưa upload video"
            });
        }

        const outputName =
            makeOutputName("watermark", "mp4");

        const outputPath =
            path.join(outputDir, outputName);

        const pos =
            getWatermarkPosition(position);

        const drawText =
            `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:` +
            `text='${text}':fontcolor=white:fontsize=36:` +
            `box=1:boxcolor=black@0.45:boxborderw=12:${pos}`;

        await runFFmpeg([
            "-i", video.path,
            "-vf", drawText,
            "-c:a", "copy",
            outputPath
        ]);

        deleteFile(video.path);

        res.json({
            success: true,
            message: "Thêm watermark thành công",
            downloadUrl: getDownloadUrl(outputName)
        });

    } catch (error) {
        console.log("Lỗi watermark:", error);

        if (req.file) {
            deleteFile(req.file.path);
        }

        res.status(500).json({
            error: "Lỗi thêm watermark"
        });
    }
});

/* 13. CHUYỂN ĐỊNH DẠNG VIDEO */

app.post("/convert-video", upload.single("video"), async (req, res) => {
    try {
        const video = getVideoFile(req);

        const format =
            req.body.format || "mp4";

        if (!video) {
            return res.status(400).json({
                error: "Bạn chưa upload video"
            });
        }

        const allowed =
            ["mp4", "webm", "mov", "mkv"];

        const ext =
            allowed.includes(format) ? format : "mp4";

        const outputName =
            makeOutputName("converted", ext);

        const outputPath =
            path.join(outputDir, outputName);

        let args =
            ["-i", video.path];

        if (ext === "webm") {
            args.push(
                "-c:v", "libvpx-vp9",
                "-b:v", "1M",
                "-c:a", "libopus"
            );
        } else {
            args.push(
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-crf", "23",
                "-c:a", "aac"
            );
        }

        args.push(outputPath);

        await runFFmpeg(args);

        deleteFile(video.path);

        res.json({
            success: true,
            message: `Chuyển sang ${ext.toUpperCase()} thành công`,
            downloadUrl: getDownloadUrl(outputName)
        });

    } catch (error) {
        console.log("Lỗi đổi định dạng:", error);

        if (req.file) {
            deleteFile(req.file.path);
        }

        res.status(500).json({
            error: "Lỗi chuyển định dạng video"
        });
    }
});

/* 14. LÀM VIDEO LOOP */

app.post("/loop-video", upload.single("video"), async (req, res) => {
    try {
        const video = getVideoFile(req);

        const count =
            Math.max(
                2,
                Math.min(
                    Number(req.body.count || 3),
                    20
                )
            );

        if (!video) {
            return res.status(400).json({
                error: "Bạn chưa upload video"
            });
        }

        const outputName =
            makeOutputName("loop", "mp4");

        const outputPath =
            path.join(outputDir, outputName);

        await runFFmpeg([
            "-stream_loop", String(count - 1),
            "-i", video.path,
            "-c", "copy",
            outputPath
        ]);

        deleteFile(video.path);

        res.json({
            success: true,
            message: `Loop video ${count} lần thành công`,
            downloadUrl: getDownloadUrl(outputName)
        });

    } catch (error) {
        console.log("Lỗi loop video:", error);

        if (req.file) {
            deleteFile(req.file.path);
        }

        res.status(500).json({
            error: "Lỗi làm video loop"
        });
    }
});

/* 15. TẠO VIDEO TỪ ẢNH + NHẠC */

app.post(
    "/image-audio-video",
    upload.fields([
        { name: "image", maxCount: 1 },
        { name: "audio", maxCount: 1 }
    ]),
    async (req, res) => {
        try {
            const image = getImageFile(req);
            const audio = getAudioFile(req);

            if (!image || !audio) {
                return res.status(400).json({
                    error: "Bạn cần upload 1 ảnh và 1 file nhạc"
                });
            }

            const outputName =
                makeOutputName("image-music", "mp4");

            const outputPath =
                path.join(outputDir, outputName);

            await runFFmpeg([
                "-loop", "1",
                "-i", image.path,
                "-i", audio.path,
                "-vf",
                "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
                "-c:v", "libx264",
                "-tune", "stillimage",
                "-c:a", "aac",
                "-b:a", "192k",
                "-pix_fmt", "yuv420p",
                "-shortest",
                outputPath
            ]);

            deleteFile(image.path);
            deleteFile(audio.path);

            res.json({
                success: true,
                message: "Tạo video từ ảnh + nhạc thành công",
                downloadUrl: getDownloadUrl(outputName)
            });

        } catch (error) {
            console.log("Lỗi tạo video ảnh + nhạc:", error);

            if (req.files?.image) {
                deleteFile(req.files.image[0].path);
            }

            if (req.files?.audio) {
                deleteFile(req.files.audio[0].path);
            }

            res.status(500).json({
                error: "Lỗi tạo video từ ảnh + nhạc"
            });
        }
    }
);

/* TẢI FILE */

app.get("/download/:filename", (req, res) => {
    const filename =
        req.params.filename;

    const filePath =
        path.join(outputDir, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send(
            "File không tồn tại"
        );
    }

    res.download(filePath, filename, err => {
        if (err) {
            console.log("Lỗi tải file:", err);
        }

        deleteFile(filePath);
    });
});

const PORT =
    process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server chạy tại port ${PORT}`);
});