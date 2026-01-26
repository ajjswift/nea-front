import { faJava, faJs, faPython } from "@fortawesome/free-brands-svg-icons";
import { faFile, faFileText } from "@fortawesome/free-regular-svg-icons";
import { faWarning } from "@fortawesome/free-solid-svg-icons";

class LanguageInfo {
    constructor(language, icon) {
        this.language = language;
        this.icon = icon;
    }
}

export class FileLanguageService {
    constructor(registry = new Map()) {
        this.registry = registry;

        if (!this.registry.size) {
            this.registry.set("py", new LanguageInfo("python", faPython));
            this.registry.set("js", new LanguageInfo("javascript", faJs));
            this.registry.set("java", new LanguageInfo("java", faJava));
            this.registry.set("txt", new LanguageInfo("text", faFileText));
            this.registry.set("empty", new LanguageInfo("none", faFile));
            this.registry.set("error", new LanguageInfo("none", faWarning));
        }
    }

    getFileExtension(fileName) {
        return fileName?.split(".")?.at(-1) || "";
    }

    getFileName(fileName) {
        const parts = fileName?.split(".");
        if (parts && parts.length > 1 && parts[0] === "") {
            return "";
        }
        return parts?.[0] || "";
    }

    getProgrammingLanguage(fileName) {
        return this.#getPLInformation(fileName).language;
    }

    getFileIcon(fileName) {
        return this.#getPLInformation(fileName).icon;
    }

    register(ext, language, icon) {
        this.registry.set(ext, new LanguageInfo(language, icon));
        return this;
    }

    #getPLInformation(fileName) {
        const fileExtension = this.getFileExtension(fileName);

        if (!isValidFileName(fileName, this)) {
            return this.registry.get("error");
        }

        return this.registry.get(fileExtension) || this.registry.get("empty");
    }
}

const defaultService = new FileLanguageService();

export function getProgrammingLanguage(fileName) {
    return defaultService.getProgrammingLanguage(fileName);
}

export function getFileExtension(fileName) {
    return defaultService.getFileExtension(fileName);
}

export function getFileIcon(fileName) {
    return defaultService.getFileIcon(fileName);
}

export function isValidFileName(fileName, registry = defaultService) {
    const fileExtension = registry.getFileExtension(fileName);
    const baseFileName = registry.getFileName(fileName);
    const trimmedFileName = fileName?.trim();

    if (
        (baseFileName.trim() === "" &&
            fileExtension !== "" &&
            trimmedFileName.startsWith(".")) ||
        baseFileName.trim() !== baseFileName
    ) {
        return false;
    }

    return true;
}
