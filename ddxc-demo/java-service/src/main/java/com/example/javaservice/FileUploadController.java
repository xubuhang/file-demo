package com.example.javaservice;

import org.apache.commons.codec.digest.DigestUtils;
import org.apache.commons.io.FileUtils;
import org.apache.commons.io.FilenameUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.*;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/")
@CrossOrigin("*")
public class FileUploadController {

    @Value("${file.upload-dir}")
    private String uploadDir;

    @Value("${file.merged-dir}")
    private String mergedDir;

    @PostMapping("/upload")
    public Map uploadChunk(@RequestParam("chunk") MultipartFile file,
                                              @RequestParam("fileName") String fileName,
                                              @RequestParam("index") int chunkIndex,
                                              @RequestParam("chunkHash") String chunkHash) throws IOException {
        String chunkFileName = chunkIndex + "_" + chunkHash;
        File chunkFile = new File(uploadDir, fileName + "/" + chunkFileName);
        Map map = new HashMap<>();
        if (chunkFile.exists()) {
            map.put("msg", "Chunk already exists");
            return map;
        }

        FileUtils.copyInputStreamToFile(file.getInputStream(), chunkFile);
        map.put("msg", "Chunk uploaded successfully");
        return map;
    }

    @PostMapping("/merge")
    public Map mergeChunks(@RequestBody Map<String, String> jsonMap) throws IOException {
        String fileName = jsonMap.get("fileName");
        String combinedHash = jsonMap.get("combinedHash");
        File chunkDir = new File(uploadDir, fileName);
        Map map = new HashMap<>();
        if (!chunkDir.exists()) {
            map.put("msg", "No chunks found");
            return map;
        }

        File mergedFile = new File(mergedDir, fileName);

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

        if (!mergedFile.getParentFile().exists()) {
            mergedFile.getParentFile().mkdirs();
        }

        try (FileOutputStream fos = new FileOutputStream(mergedFile)) {
            for (File chunk : sortedChunks) {
                Files.copy(chunk.toPath(), fos);
                chunk.delete();
            }
        }
        FileUtils.deleteDirectory(chunkDir);

        // 计算合并文件的MD5值并与combinedHash比较
        String mergedFileHash = DigestUtils.md5Hex(FileUtils.readFileToByteArray(mergedFile));
        if (!mergedFileHash.equals(combinedHash)) {
            Files.delete(mergedFile.toPath());
            map.put("msg", "Combined hash mismatch");
            return map;
        }

        map.put("msg", "File merged successfully");
        return map;
    }

    @GetMapping("/existing-chunks")
    public Map getExistingChunks(@RequestParam("fileName") String fileName) {
        File chunkDir = new File(uploadDir, fileName);
        Map map = new HashMap<>();
        if (!chunkDir.exists()) {
            map.put("existingChunks", new ArrayList<>());
            return map;
        }
        List list =  Arrays.stream(chunkDir.listFiles())
                .map(File::getName).map(p->{
                    return p.substring(0,p.indexOf("_"));
                })
                .collect(Collectors.toList());
        map.put("existingChunks", list);
        return map;
    }

    @GetMapping("/existing-file")
    public Map getExistingFile(@RequestParam("fileName") String fileName) throws IOException {
        File mergedFile = new File(mergedDir, fileName);
        Map map = new HashMap<>();
        if (!mergedFile.exists()) {
            map.put("md5", "");
            return map;
        }
        String mergedFileHash = DigestUtils.md5Hex(FileUtils.readFileToByteArray(mergedFile));
        map.put("md5", mergedFileHash);

        return map;
    }


    public static void main(String[] args) {

        try {
            File mergedFile = new File("D:\\", "winrar-x64-700scp.exe");
            String mergedFileHash = DigestUtils.md5Hex(FileUtils.readFileToByteArray(mergedFile));
            System.out.println(mergedFileHash);
            File mergedFile1 = new File("D:\\uploads\\merged", "winrar-x64-700scp.exe");
            String mergedFileHash1 = DigestUtils.md5Hex(FileUtils.readFileToByteArray(mergedFile1));
            System.out.println(mergedFileHash1);
        }catch (Exception e){
            e.printStackTrace();
        }

    }
}
