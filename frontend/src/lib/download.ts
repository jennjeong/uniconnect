// Hands the browser a file to save: one made on the page (the data download,
// a calendar file) or fetched (a PDF from a conversation).
export function saveFile(name: string, contents: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}
