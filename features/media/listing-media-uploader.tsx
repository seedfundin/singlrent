"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { CheckCircle2, CircleAlert, ImagePlus, LoaderCircle, Trash2, Upload, Video } from "lucide-react";
import { useAppSession } from "@/features/app/app-provider";
import { api, type ListingMediaInput, type ListingMediaType } from "@/lib/api";
import "./listing-media-uploader.css";

type UploadStatus = "uploading" | "success" | "failed";
type UploadItem = ListingMediaInput & {
  id: string;
  name: string;
  previewUrl?: string;
  file?: File;
  progress: number;
  status: UploadStatus;
  error?: string;
};

const imageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const videoMimeTypes = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const imageMaximumBytes = 5 * 1024 * 1024;
const videoMaximumBytes = 50 * 1024 * 1024;

function mediaValidationError(file: File, mediaType: ListingMediaType): string | null {
  if (mediaType === "IMAGE") {
    return imageMimeTypes.has(file.type) && file.size <= imageMaximumBytes
      ? null
      : "Each image must be JPEG, PNG or WebP and no larger than 5 MB.";
  }
  return videoMimeTypes.has(file.type) && file.size <= videoMaximumBytes
    ? null
    : "The listing video must be MP4, WebM or MOV and no larger than 50 MB.";
}

function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const source = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(source);
      resolve(Number.isFinite(video.duration) ? video.duration : 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(source);
      resolve(0);
    };
    video.src = source;
  });
}

function uploadDirectly(uploadUrl: string, file: File, onProgress: (progress: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", uploadUrl);
    request.setRequestHeader("Content-Type", file.type);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error("The upload could not reach storage. Please try again."));
    request.onload = () => request.status >= 200 && request.status < 300
      ? resolve()
      : reject(new Error("The upload was rejected by storage. Please try again."));
    request.send(file);
  });
}

function uploadedMedia(items: UploadItem[]): ListingMediaInput[] {
  const images = items.filter((item) => item.status === "success" && item.mediaType === "IMAGE");
  const videos = items.filter((item) => item.status === "success" && item.mediaType === "VIDEO");
  return [
    ...images.map((item, position) => ({ objectKey: item.objectKey, mediaType: item.mediaType, altText: item.altText, position })),
    // Position is an input ordering value. The server deliberately places the
    // single video after photos when it persists the listing, so sending 0 here
    // keeps the request within the public API's valid 0–100 range.
    ...videos.map((item) => ({ objectKey: item.objectKey, mediaType: item.mediaType, altText: item.altText, position: 0 })),
  ];
}

export function ListingMediaUploader({
  media,
  onChange,
}: {
  media: ListingMediaInput[];
  onChange: (media: ListingMediaInput[]) => void;
}) {
  const { session } = useAppSession();
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const onChangeRef = useRef(onChange);
  const itemsRef = useRef<UploadItem[]>([]);
  const [items, setItems] = useState<UploadItem[]>(() => media.map((item) => ({
    ...item,
    id: item.objectKey,
    name: item.objectKey.split("/").at(-1) ?? "Uploaded media",
    progress: 100,
    status: "success",
  })));
  const [message, setMessage] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  onChangeRef.current = onChange;
  itemsRef.current = items;

  useEffect(() => {
    onChangeRef.current(uploadedMedia(items));
  }, [items]);

  useEffect(() => () => {
    itemsRef.current.forEach((item) => {
      if (item.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
    });
  }, []);

  const updateItem = (id: string, update: (item: UploadItem) => UploadItem) => {
    setItems((current) => current.map((item) => item.id === id ? update(item) : item));
  };

  const upload = async (item: UploadItem) => {
    if (!session || !item.file) {
      updateItem(item.id, (current) => ({ ...current, status: "failed", error: "Sign in again before uploading media." }));
      return;
    }
    updateItem(item.id, (current) => ({ ...current, status: "uploading", progress: 0, error: undefined }));
    try {
      const signed = await api.media.createPresignedUpload(session.accessToken, {
        kind: "listing",
        mediaType: item.mediaType,
        mimeType: item.file.type,
        size: item.file.size,
      });
      await uploadDirectly(signed.uploadUrl, item.file, (progress) => updateItem(item.id, (current) => ({ ...current, progress })));
      updateItem(item.id, (current) => ({
        ...current,
        objectKey: signed.objectKey,
        previewUrl: current.previewUrl ?? signed.publicUrl,
        progress: 100,
        status: "success",
      }));
    } catch (cause) {
      updateItem(item.id, (current) => ({
        ...current,
        status: "failed",
        error: cause instanceof Error ? cause.message : "The media upload failed. Please try again.",
      }));
    }
  };

  const selectFiles = async (event: ChangeEvent<HTMLInputElement>, mediaType: ListingMediaType) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selected.length) return;
    const active = items.filter((item) => item.status !== "failed");
    const imageCount = active.filter((item) => item.mediaType === "IMAGE").length;
    const videoCount = active.filter((item) => item.mediaType === "VIDEO").length;
    const incomingImages = selected.filter((file) => mediaType === "IMAGE").length;
    const incomingVideos = selected.filter((file) => mediaType === "VIDEO").length;
    if (active.length + selected.length > 5 || imageCount + incomingImages > 4 || videoCount + incomingVideos > 1) {
      setMessage("You can upload a maximum of 4 images, 1 video, and 5 media files in total.");
      return;
    }
    for (const file of selected) {
      const validationError = mediaValidationError(file, mediaType);
      if (validationError) {
        setMessage(validationError);
        return;
      }
      if (mediaType === "VIDEO") {
        const duration = await readVideoDuration(file);
        if (duration > 65) {
          setMessage("Keep the listing video to approximately 60 seconds or less.");
          return;
        }
      }
    }
    setMessage(null);
    const next = selected.map((file) => ({
      id: crypto.randomUUID(),
      objectKey: "",
      mediaType,
      name: file.name,
      previewUrl: URL.createObjectURL(file),
      file,
      progress: 0,
      status: "uploading" as const,
    }));
    setItems((current) => [...current, ...next]);
    next.forEach((item) => void upload(item));
  };

  const remove = async (item: UploadItem) => {
    if (item.status === "uploading") return;
    setRemovingId(item.id);
    try {
      if (item.status === "success" && item.objectKey) {
        if (!session) throw new Error("Sign in again before removing media.");
        await api.media.deleteUnassociatedUpload(session.accessToken, item.objectKey);
      }
      if (item.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "The media could not be removed.");
    } finally {
      setRemovingId(null);
    }
  };

  const activeImages = items.filter((item) => item.status !== "failed" && item.mediaType === "IMAGE").length;
  const activeVideos = items.filter((item) => item.status !== "failed" && item.mediaType === "VIDEO").length;

  return <section className="listing-media-uploader" aria-label="Listing media">
    <header>
      <span><small>Listing media</small><h3>Upload 3–4 photos and 1 video.</h3></span>
      <p>Photos: 3–4 JPEG, PNG or WebP files, 5 MB each. Video: 1 MP4, WebM or MOV file, 50 MB maximum; around 60 seconds is recommended.</p>
    </header>
    {message && <p className="media-message"><CircleAlert size={15} /> {message}</p>}
    <div className="media-actions">
      <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => void selectFiles(event, "IMAGE")} />
      <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(event) => void selectFiles(event, "VIDEO")} />
      <button type="button" onClick={() => imageInputRef.current?.click()} disabled={activeImages >= 4 || items.filter((item) => item.status !== "failed").length >= 5}><ImagePlus size={15} /> Add photos <small>{activeImages}/4</small></button>
      <button type="button" onClick={() => videoInputRef.current?.click()} disabled={activeVideos >= 1 || items.filter((item) => item.status !== "failed").length >= 5}><Video size={15} /> Add video <small>{activeVideos}/1</small></button>
    </div>
    <div className="media-grid">
      {items.map((item) => <article className={`media-item ${item.mediaType.toLowerCase()} ${item.status}`} key={item.id}>
        <div className="media-preview">
          {item.mediaType === "IMAGE"
            ? item.previewUrl && <img src={item.previewUrl} alt={item.name} />
            : item.previewUrl && <video controls preload="metadata" src={item.previewUrl} />}
        </div>
        <div className="media-item-copy"><span>{item.mediaType === "IMAGE" ? <ImagePlus size={13} /> : <Video size={13} />}{item.name}</span>
          {item.status === "uploading" && <small><LoaderCircle size={12} /> Uploading {item.progress}%</small>}
          {item.status === "success" && <small className="success"><CheckCircle2 size={12} /> Uploaded</small>}
          {item.status === "failed" && <small className="error"><CircleAlert size={12} /> {item.error}</small>}
        </div>
        {item.status === "failed" && item.file && <button type="button" className="media-retry" onClick={() => void upload(item)}>Try again</button>}
        <button type="button" className="media-remove" onClick={() => void remove(item)} disabled={item.status === "uploading" || removingId === item.id} aria-label={`Remove ${item.name}`}><Trash2 size={14} /></button>
      </article>)}
      {!items.length && <div className="media-empty"><Upload size={20} /><b>Your uploaded media will appear here.</b><small>Add 3–4 photos and one video to publish the listing.</small></div>}
    </div>
  </section>;
}
