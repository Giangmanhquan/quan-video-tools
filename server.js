const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const uploadDir = path.join(__dirname, "uploads");
const outputDir = path.join(__dirname, "downloads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },

    filename: function (req, file, cb) {
        const uniqueName =
            Date.now() + "-" + file.originalname.replace(/\s+/g, "-");

        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,

    limits: {
        fileSize: 600 * 1024 * 1024
    },

    fileFilter: function (req, file, cb) {
        if (!file.mimetype.startsWith("video/")) {
            return cb(new Error("Chỉ cho phép upload file video"));
        }

        cb(null, true);
    }
});

function deleteFile(filePath) {
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

/* CHUYỂN VIDEO SANG MP3 */

app.post("/convert-mp3", upload.single("video"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: "Bạn chưa upload video"
            });
        }

        const inputPath = req.file.path;

        const outputName =
            `audio-${Date.now()}.mp3`;

        const outputPath =
            path.join(outputDir, outputName);

        console.log("Đang chuyển video sang MP3...");

        await execFileAsync("ffmpeg", [
            "-i",
            inputPath,

            "-vn",

            "-ar",
            "44100",

            "-ac",
            "2",

            "-b:a",
            "192k",

            outputPath
        ]);

        deleteFile(inputPath);

        console.log("Chuyển MP3 xong:", outputPath);

        res.json({
            success: true,
            message: "Chuyển MP3 thành công",
            downloadUrl: `/download/${outputName}`
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

/* NÉN VIDEO */

app.post("/compress-video", upload.single("video"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: "Bạn chưa upload video"
            });
        }

        const inputPath = req.file.path;

        const outputName =
            `compressed-${Date.now()}.mp4`;

        const outputPath =
            path.join(outputDir, outputName);

        console.log("Đang nén video...");

        await execFileAsync("ffmpeg", [
            "-i",
            inputPath,

            "-vcodec",
            "libx264",

            "-crf",
            "28",

            "-preset",
            "veryfast",

            "-acodec",
            "aac",

            "-b:a",
            "128k",

            outputPath
        ]);

        deleteFile(inputPath);

        console.log("Nén video xong:", outputPath);

        res.json({
            success: true,
            message: "Nén video thành công",
            downloadUrl: `/download/${outputName}`
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

/* TẢI FILE KẾT QUẢ */

app.get("/download/:filename", (req, res) => {
    const filename = req.params.filename;

    const filePath =
        path.join(outputDir, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send("File không tồn tại");
    }

    res.download(filePath, filename, err => {
        if (err) {
            console.log("Lỗi tải file:", err);
        }

        deleteFile(filePath);
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server chạy tại port ${PORT}`);
});