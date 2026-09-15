import { LoaderCircle } from "lucide-react"

export default function Loading() {
  return (
    <div className="flex items-center justify-center py-24 text-muted-foreground">
      <LoaderCircle className="mr-2 h-6 w-6 animate-spin" />
      読み込み中...
    </div>
  )
}
