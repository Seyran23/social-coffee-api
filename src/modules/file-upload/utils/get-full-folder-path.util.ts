import {
  PROJECT_NAME,
  UploadFolder,
} from '@/modules/file-upload/constants/file-upload';

export const getFullFolderPath = (folder: UploadFolder | string): string => {
  return `${PROJECT_NAME}/${folder}`;
};
