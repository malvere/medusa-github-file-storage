import {
  DeleteFileType,
  FileServiceGetUploadStreamResult,
  FileServiceUploadResult,
  GetUploadedFileType,
  UploadStreamDescriptorType,
} from "@medusajs/types";
import { AbstractFileService } from "@medusajs/medusa";
import * as fs from "fs";
import { EntityManager, Logger } from "typeorm";

class GithubStorageService extends AbstractFileService {
  protected manager_: EntityManager;
  protected transactionManager_: EntityManager;
  logger_: Logger;
  client_: any;
  owner_: string;
  repo_: string;
  path_: string;
  cnd_url_: string;
  clientInitialized_: Promise<void>;

  constructor({ logger }, options) {
    super({}, options);

    this.owner_ = options.owner;
    this.repo_ = options.repo;
    this.path_ = options.path;
    this.cnd_url_ = options.cdn_url || "https://cdn.jsdelivr.net/gh";
    this.logger_ = logger;

    this.clientInitialized_ = this.initializeClient(options.github_token);
  }

  async initializeClient(token: string) {
    const { Octokit } = await import('octokit');
    this.client_ = new Octokit({
      auth: token || process.env.GITHUB_TOKEN,
    });
  }

  async ensureClientInitialized() {
    await this.clientInitialized_;
  }

  buildUrl(fileData: Express.Multer.File): string {
    return `${this.cnd_url_}/${this.owner_}/${this.repo_}/${this.path_}/${fileData.originalname}`;
  }

  async get(fileData: GetUploadedFileType): Promise<any> {
    await this.ensureClientInitialized();

    try {
      const { data } = await this.client_.request(
        "GET /repos/{owner}/{repo}/contents/{path}",
        {
          owner: this.owner_,
          repo: this.repo_,
          path: `${this.path_}/${fileData.fileKey}`,
        }
      );

      if (data) {
        return data;
      }
    } catch (e) {
      if (e.status !== 404) {
        this.logger_.log("info", `Error fetching file: ${e.message}`);
      }
    }
    return null;
  }

  async upload(file: Express.Multer.File): Promise<FileServiceUploadResult> {
    await this.ensureClientInitialized();

    const base64File = fs.readFileSync(file.path, { encoding: "base64" });
    const exist = await this.get({ fileKey: file.originalname });

    if (exist) {
      return {
        url: this.buildUrl(file),
        key: exist.sha,
      };
    }

    try {
      const { data } = await this.client_.request(
        "PUT /repos/{owner}/{repo}/contents/{path}",
        {
          owner: this.owner_,
          repo: this.repo_,
          path: `${this.path_}/${file.originalname}`,
          message: "Upload file",
          content: base64File,
        }
      );

      if (data) {
        return {
          url: this.buildUrl(file),
          key: data.content.sha,
        };
      }
    } catch (error) {
      this.logger_.log("info",`Error uploading file: ${error.message}`);
      throw new Error("Unable to upload file");
    } finally {
      // Ensure the temporary file is deleted
      // fs.unlinkSync(file.path);
    }
  }

  async delete(file: DeleteFileType): Promise<void> {
    await this.ensureClientInitialized();

    try {
      await this.client_.request(
        "DELETE /repos/{owner}/{repo}/contents/{path}",
        {
          owner: this.owner_,
          repo: this.repo_,
          path: `${this.path_}/${file.originalname}`,
          sha: file.fileKey,
          message: "Delete file",
        }
      );
    } catch (error) {
      this.logger_.log("info",`Error deleting file: ${error.message}`);
      throw new Error("Unable to delete file");
    }
  }

  async getUploadStreamDescriptor(
    fileData: UploadStreamDescriptorType
  ): Promise<FileServiceGetUploadStreamResult> {
    console.log("getUploadStreamDescriptor", fileData);
    return {
      writeStream: null,
      promise: null,
      url: null,
      fileKey: null,
    };
  }

  async getDownloadStream(
    fileData: GetUploadedFileType
  ): Promise<NodeJS.ReadableStream> {
    console.log("getDownloadStream", fileData);
    return null;
  }

  async getPresignedDownloadUrl(
    fileData: GetUploadedFileType
  ): Promise<string> {
    console.log("getPresignedDownloadUrl", fileData);
    return null;
  }

  uploadProtected(
    fileData: Express.Multer.File
  ): Promise<FileServiceUploadResult> {
    console.log("uploadProtected", fileData);
    return null;
  }
}

export default GithubStorageService;
