package com.aid.media.provider;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.aid.common.config.AidAppConfig;
import com.aid.common.constant.Constants;
import com.aid.domain.vo.AiModelConfigVo;

import cn.hutool.core.util.StrUtil;
import lombok.extern.slf4j.Slf4j;

/**
 * 参考图 Base64 传图统一工具：模型 capability_json 声明支持且运营开启时，把参考图 URL 下载转 data URI。
 * 用于官方支持 Base64 传图、但上游网关无法回源下载业务 CDN 的场景（如 gpt-image-2 网关拉不到内网 CDN）。
 *
 * @author 视觉AID
 */
@Slf4j
public final class ReferenceImageBase64Support {

    private ReferenceImageBase64Support() {
    }

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** capability_json：官方是否支持 Base64 传图（能力位） */
    private static final String KEY_SUPPORTS_BASE64 = "supportsBase64Image";

    /** capability_json：运营是否启用 Base64 传图（开关） */
    private static final String KEY_BASE64_ENABLED = "base64ImageEnabled";

    /** 单张参考图下载上限（10MB），超限跳过转换、退回原 URL */
    private static final long MAX_IMAGE_BYTES = 10L * 1024 * 1024;

    private static final HttpClient CLIENT = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .build();

    /**
     * 判定该模型当前是否应走 Base64 传图：能力位与开关同时为 true 才生效。
     *
     * @param modelConfig 模型聚合配置
     * @return true 表示应把参考图转为 Base64 下发
     */
    public static boolean isBase64Enabled(AiModelConfigVo modelConfig) {
        if (modelConfig == null || StrUtil.isBlank(modelConfig.getCapabilityJson())) {
            return false;
        }
        try {
            JsonNode root = MAPPER.readTree(modelConfig.getCapabilityJson());
            boolean supports = root.path(KEY_SUPPORTS_BASE64).asBoolean(false);
            boolean enabled = root.path(KEY_BASE64_ENABLED).asBoolean(false);
            return supports && enabled;
        } catch (Exception e) {
            log.warn("解析 capability_json base64 开关失败, modelCode={}, err={}",
                    modelConfig.getModelCode(), e.getMessage());
            return false;
        }
    }

    /**
     * 把参考图 URL 列表按需转为 data URI（data:image/xxx;base64,...）。
     * 非 http(s) 开头（已是 base64/data URI）原样保留；下载失败或超限的单张退回原 URL，不阻断整批。
     *
     * @param imageUrls 参考图 URL 列表
     * @return 转换后的列表（顺序不变）
     */
    public static List<String> toDataUris(List<String> imageUrls) {
        List<String> result = new ArrayList<>();
        if (imageUrls == null || imageUrls.isEmpty()) {
            return result;
        }
        for (String url : imageUrls) {
            if (StrUtil.isBlank(url)) {
                continue;
            }
            String lower = url.toLowerCase();
            if (isLocalProfileUrl(url)) {
                String dataUri = localProfileAsDataUri(url);
                result.add(StrUtil.isNotBlank(dataUri) ? dataUri : url);
                continue;
            }
            if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
                // 已是 data URI 或 base64，原样保留
                result.add(url);
                continue;
            }
            String dataUri = downloadAsDataUri(url);
            result.add(StrUtil.isNotBlank(dataUri) ? dataUri : url);
        }
        return result;
    }

    /**
     * 仅把本站本地 profile 图片转成 data URI；公网 URL 与已有内联数据保持原样。
     * 视频 Provider 可用它修复本机部署中外部厂商无法回源 localhost 的问题，
     * 同时避免无条件下载公网素材。
     */
    public static List<String> inlineLocalProfileImages(List<String> imageUrls) {
        List<String> result = new ArrayList<>();
        if (imageUrls == null || imageUrls.isEmpty()) {
            return result;
        }
        for (String url : imageUrls) {
            if (StrUtil.isBlank(url)) {
                continue;
            }
            if (!isLocalProfileUrl(url)) {
                result.add(url);
                continue;
            }
            String dataUri = localProfileAsDataUri(url);
            result.add(StrUtil.isNotBlank(dataUri) ? dataUri : url);
        }
        return result;
    }

    /**
     * 判断引用是否为当前部署真实可读的本地 {@code /profile} 图片。
     *
     * <p>通用远程 URL 校验器会按 SSRF 规则拒绝 localhost/127.0.0.1；本地部署上传的图片
     * 恰好使用该地址。因此这里只对能够安全映射到 {@link AidAppConfig#getProfile()} 目录内、
     * 文件真实存在且大小合法的图片放行，不放宽任何其它内网 URL。</p>
     */
    public static boolean isReadableLocalProfileImage(String imageUrl) {
        try {
            Path file = resolveLocalProfileFile(imageUrl);
            if (file == null) {
                return false;
            }
            long size = Files.size(file);
            if (size <= 0 || size > MAX_IMAGE_BYTES) {
                return false;
            }
            String mime = Files.probeContentType(file);
            if (StrUtil.isBlank(mime)) {
                mime = inferMime(imageUrl);
            }
            return StrUtil.isNotBlank(mime) && mime.toLowerCase().startsWith("image/");
        } catch (Exception e) {
            log.info("本地 profile 参考图校验失败, url={}, err={}", imageUrl, e.getMessage());
            return false;
        }
    }

    /**
     * 读取真实可用的本地 {@code /profile} 图片；非本地图片或校验失败时返回 {@code null}。
     * 调用方可据此绕过 HTTP 回环地址校验，直接把字节提交给本机图片适配器。
     */
    public static byte[] readLocalProfileImageBytes(String imageUrl) {
        if (!isReadableLocalProfileImage(imageUrl)) {
            return null;
        }
        try {
            Path file = resolveLocalProfileFile(imageUrl);
            return file == null ? null : Files.readAllBytes(file);
        } catch (Exception e) {
            log.info("本地 profile 参考图读取失败, url={}, err={}", imageUrl, e.getMessage());
            return null;
        }
    }

    /**
     * 把参考图 URL 列表转为「裸 base64」列表（无 data URI 前缀，即梦 binary_data_base64 官方格式）。
     * 已是 data URI 的剥前缀保留；下载失败的单张跳过（即梦不接受 URL 与 base64 混填）。
     *
     * @param imageUrls 参考图 URL 列表
     * @return 裸 base64 列表（顺序不变，失败项剔除）
     */
    public static List<String> toRawBase64s(List<String> imageUrls) {
        List<String> result = new ArrayList<>();
        if (imageUrls == null || imageUrls.isEmpty()) {
            return result;
        }
        for (String url : imageUrls) {
            if (StrUtil.isBlank(url)) {
                continue;
            }
            String lower = url.toLowerCase();
            if (lower.startsWith("data:")) {
                int comma = url.indexOf(',');
                result.add(comma > 0 ? url.substring(comma + 1) : url);
                continue;
            }
            if (isLocalProfileUrl(url)) {
                String dataUri = localProfileAsDataUri(url);
                if (StrUtil.isNotBlank(dataUri)) {
                    int comma = dataUri.indexOf(',');
                    result.add(comma > 0 ? dataUri.substring(comma + 1) : dataUri);
                } else {
                    log.warn("本地参考图 Base64 转换失败跳过该图, url={}", url);
                }
                continue;
            }
            if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
                // 视为已是裸 base64
                result.add(url);
                continue;
            }
            String dataUri = downloadAsDataUri(url);
            if (StrUtil.isNotBlank(dataUri)) {
                int comma = dataUri.indexOf(',');
                result.add(comma > 0 ? dataUri.substring(comma + 1) : dataUri);
            } else {
                log.warn("裸 base64 转换失败跳过该图, url={}", url);
            }
        }
        return result;
    }

    private static boolean isLocalProfileUrl(String imageUrl) {
        return extractLocalProfilePath(imageUrl) != null;
    }

    private static String extractLocalProfilePath(String imageUrl) {
        if (imageUrl == null) {
            return null;
        }
        if (imageUrl.equals(Constants.RESOURCE_PREFIX)
                || imageUrl.startsWith(Constants.RESOURCE_PREFIX + "/")) {
            return imageUrl;
        }
        try {
            URI uri = URI.create(imageUrl);
            String host = StrUtil.blankToDefault(uri.getHost(), "").toLowerCase();
            String path = uri.getPath();
            boolean loopback = "localhost".equals(host) || "127.0.0.1".equals(host) || "::1".equals(host);
            if (loopback && path != null && (path.equals(Constants.RESOURCE_PREFIX)
                    || path.startsWith(Constants.RESOURCE_PREFIX + "/"))) {
                return path;
            }
        } catch (IllegalArgumentException ignore) {
            // 非 URI 文本按普通外部值处理。
        }
        return null;
    }

    /** 读取本站 /profile 相对路径，防止本机部署没有公开 localDomain 时把路径文本误当成 Base64。 */
    private static String localProfileAsDataUri(String imageUrl) {
        try {
            Path file = resolveLocalProfileFile(imageUrl);
            if (file == null) {
                return null;
            }
            long size = Files.size(file);
            if (size <= 0 || size > MAX_IMAGE_BYTES) {
                log.warn("本地 Base64 参考图为空或超限, url={}, bytes={}", imageUrl, size);
                return null;
            }
            byte[] bytes = Files.readAllBytes(file);
            String mime = Files.probeContentType(file);
            if (StrUtil.isBlank(mime) || !mime.toLowerCase().startsWith("image/")) {
                mime = inferMime(imageUrl);
            }
            return "data:" + mime + ";base64," + Base64.getEncoder().encodeToString(bytes);
        } catch (Exception e) {
            log.error("本地 Base64 参考图读取失败, url={}, err={}", imageUrl, e.getMessage());
            return null;
        }
    }

    /** 安全地把本站 /profile URL 映射到 profile 根目录内的实际文件。 */
    private static Path resolveLocalProfileFile(String imageUrl) {
        String profile = AidAppConfig.getProfile();
        if (StrUtil.isBlank(profile) || StrUtil.isBlank(imageUrl) || imageUrl.contains("..")) {
            return null;
        }
        String profilePath = extractLocalProfilePath(imageUrl);
        if (profilePath == null) {
            return null;
        }
        Path root = Path.of(profile).toAbsolutePath().normalize();
        String relative = profilePath.substring(Constants.RESOURCE_PREFIX.length());
        while (relative.startsWith("/")) {
            relative = relative.substring(1);
        }
        Path file = root.resolve(relative).normalize();
        if (file.equals(root) || !file.startsWith(root) || !Files.isRegularFile(file)) {
            return null;
        }
        return file;
    }

    /**
     * 下载单张图片并编码为 data URI；失败返回 null。
     */
    private static String downloadAsDataUri(String imageUrl) {
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(imageUrl))
                    .timeout(Duration.ofSeconds(30))
                    .GET()
                    .build();
            HttpResponse<byte[]> resp = CLIENT.send(req, HttpResponse.BodyHandlers.ofByteArray());
            if (resp.statusCode() != 200 || resp.body() == null || resp.body().length == 0) {
                log.warn("Base64 参考图下载非200或空, url={}, status={}", imageUrl, resp.statusCode());
                return null;
            }
            if (resp.body().length > MAX_IMAGE_BYTES) {
                log.warn("Base64 参考图超限跳过转换, url={}, bytes={}", imageUrl, resp.body().length);
                return null;
            }
            String mime = resp.headers().firstValue("content-type").orElse(inferMime(imageUrl));
            String b64 = Base64.getEncoder().encodeToString(resp.body());
            return "data:" + mime + ";base64," + b64;
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.error("Base64 参考图下载失败, url={}, err={}", imageUrl, e.getMessage());
            return null;
        }
    }

    /**
     * 按扩展名兜底推断 MIME 类型。
     */
    private static String inferMime(String url) {
        String lower = url.toLowerCase();
        if (lower.contains(".png")) {
            return "image/png";
        }
        if (lower.contains(".webp")) {
            return "image/webp";
        }
        if (lower.contains(".jpg") || lower.contains(".jpeg")) {
            return "image/jpeg";
        }
        return "image/png";
    }
}
