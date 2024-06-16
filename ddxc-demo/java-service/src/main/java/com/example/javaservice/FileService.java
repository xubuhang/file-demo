package com.example.javaservice;

import org.apache.commons.codec.digest.DigestUtils;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@Service
public class FileService {

    private static final String UPLOAD_DIR = "uploads/";

    public void saveChunk(MultipartFile file, String fileName, int index, String chunkHash) throws IOException {
        File dir = new File(UPLOAD_DIR + "chunks/" + fileName);
        if (!dir.exists()) {
            dir.mkdirs();
        }
        File chunkFile = new File(dir, index + "_" + chunkHash);
        file.transferTo(chunkFile);
    }

    public List<String> getExistingChunks(String fileName) {
        File dir = new File(UPLOAD_DIR + "chunks/" + fileName);
        if (!dir.exists()) {
            return Collections.emptyList();
        }
        File[] files = dir.listFiles();
        List<String> chunkFiles = new ArrayList<>();
        if (files != null) {
            for (File file : files) {
                chunkFiles.add(file.getName());
            }
        }
        return chunkFiles;
    }

    public void mergeChunks(String fileName, String combinedHash) throws IOException {
        File chunkDir = new File(UPLOAD_DIR + "chunks/" + fileName);
        File[] chunkFiles = chunkDir.listFiles();
        if (chunkFiles == null) {
            throw new IOException("No chunks found");
        }

        List<File> sortedChunks = new ArrayList<>();
        for (File chunk : chunkFiles) {
            sortedChunks.add(chunk);
        }
        sortedChunks.sort((f1, f2) -> {
            int index1 = Integer.parseInt(f1.getName().split("_")[0]);
            int index2 = Integer.parseInt(f2.getName().split("_")[0]);
            return Integer.compare(index1, index2);
        });

        File mergedFile = new File(UPLOAD_DIR + "merged/" + fileName);
        if (!mergedFile.getParentFile().exists()) {
            mergedFile.getParentFile().mkdirs();
        }

        try (FileOutputStream fos = new FileOutputStream(mergedFile)) {
            for (File chunk : sortedChunks) {
                Files.copy(chunk.toPath(), fos);
                chunk.delete();
            }
        }

        String calculatedHash = DigestUtils.md5Hex(Files.readAllBytes(mergedFile.toPath()));
        if (!calculatedHash.equals(combinedHash)) {
            mergedFile.delete();
            throw new IOException("Combined hash does not match");
        }
        chunkDir.delete();
    }
}
