export function workingDiffMode(file: { unstaged: boolean }): "-" | "+" {
  return file.unstaged ? "-" : "+";
}
