param(
    [string]$InputPath = "C:\Users\DucAnh\Downloads\Ôn tập trắc nghiệm_1_1.docx",
    [string]$OutputPath = "src\data\questions.json",
    [string]$ReportPath = "src\data\import-report.json"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression

function Normalize-Text {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return ""
    }

    $value = $Text -replace [char]0x00A0, " "
    $value = $value -replace "\s+", " "
    $value = $value.Trim()
    $value = $value -replace "^[a-dA-D][\.\)]\s*", ""
    return $value.Trim()
}

function Get-NormalizedKey {
    param([string]$Text)

    $value = (Normalize-Text $Text).ToLowerInvariant()
    $value = $value -replace "[\p{P}\p{S}\s]", ""
    return $value
}

function Get-QuestionIdentityKey {
    param(
        [string]$Question,
        [string[]]$Options,
        [int]$CorrectAnswer
    )

    $questionKey = Get-NormalizedKey $Question
    $optionKeys = @($Options | ForEach-Object { Get-NormalizedKey $_ } | Sort-Object)
    $answerKey = Get-NormalizedKey $Options[$CorrectAnswer]
    return "$questionKey|$($optionKeys -join '|')|$answerKey"
}

function Get-Topic {
    param([string]$Question)

    $text = $Question.ToLowerInvariant()

    if ($text -match "rsa|aes|des|sha|md5|pgp|mã hóa|mật mã|hàm băm|khóa công khai|khóa đối xứng|s-box|bản mã|bản rõ") {
        return "Mật mã học"
    }
    if ($text -match "điều khiển truy nhập|xác thực|mật khẩu|otp|rbac|dac|mac|bell-la padula|sinh trắc|smartcard|trao quyền") {
        return "Điều khiển truy nhập"
    }
    if ($text -match "tường lửa|firewall|ids|ips|phát hiện xâm nhập|ngăn chặn xâm nhập|proxy|gateway") {
        return "Phòng thủ hệ thống"
    }
    if ($text -match "dos|ddos|tấn công|smurf|syn flood|sql|xss|csrf|phishing|pharming|social engineering|nghe lén|giả mạo") {
        return "Tấn công mạng"
    }
    if ($text -match "lỗ hổng|tràn bộ đệm|buffer|malware|phần mềm độc hại|virus|worm|trojan|sâu|điểm yếu|bản vá") {
        return "Lỗ hổng & mã độc"
    }
    if ($text -match "quản lý|rủi ro|chính sách|tổ chức|kiểm toán|tiêu chuẩn") {
        return "Quản lý ATTT"
    }

    return "Nền tảng ATTT"
}

function Test-IsNumberedQuestion {
    param([string]$Text)
    return $Text -match "^\s*(?:Câu\s*)?\d{1,4}\.{1,2}\s+\S"
}

function Remove-QuestionNumber {
    param([string]$Text)
    return ($Text -replace "^\s*(?:Câu\s*)?\d{1,4}\.{1,2}\s+", "").Trim()
}

if (-not (Test-Path -LiteralPath $InputPath)) {
    throw "Không tìm thấy file DOCX: $InputPath"
}

$resolvedOutput = [IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputPath))
$resolvedReport = [IO.Path]::GetFullPath((Join-Path (Get-Location) $ReportPath))
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($resolvedOutput)) | Out-Null
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($resolvedReport)) | Out-Null

$stream = [IO.File]::Open($InputPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
$archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Read, $false)

try {
    $entry = $archive.GetEntry("word/document.xml")
    if (-not $entry) {
        throw "DOCX không chứa word/document.xml"
    }

    $reader = [IO.StreamReader]::new($entry.Open())
    try {
        [xml]$document = $reader.ReadToEnd()
    }
    finally {
        $reader.Dispose()
    }

    $ns = [Xml.XmlNamespaceManager]::new($document.NameTable)
    $ns.AddNamespace("w", "http://schemas.openxmlformats.org/wordprocessingml/2006/main")

    $paragraphs = [Collections.Generic.List[object]]::new()
    $sourceLine = 0

    foreach ($paragraph in $document.SelectNodes("//w:p", $ns)) {
        $text = (($paragraph.SelectNodes(".//w:t", $ns) | ForEach-Object { $_.InnerText }) -join "")
        $text = Normalize-Text $text
        if (-not $text) {
            continue
        }

        $sourceLine++
        $runs = @($paragraph.SelectNodes(".//w:r", $ns))
        $boldRuns = @($runs | Where-Object { $_.SelectSingleNode("./w:rPr/w:b", $ns) })
        $underlinedRuns = @($runs | Where-Object { $_.SelectSingleNode("./w:rPr/w:u", $ns) })

        $paragraphs.Add([pscustomobject]@{
            line = $sourceLine
            text = $text
            bold = $boldRuns.Count -gt 0
            underline = $underlinedRuns.Count -gt 0
        })
    }

    $candidates = [Collections.Generic.List[object]]::new()
    $skipped = [Collections.Generic.List[object]]::new()
    $index = 0

    while ($index -lt $paragraphs.Count) {
        $current = $paragraphs[$index]
        $isNumbered = Test-IsNumberedQuestion $current.text
        $isFormattedQuestion = $current.bold -and -not $current.underline

        if (-not $isNumbered -and -not $isFormattedQuestion) {
            $index++
            continue
        }

        $questionText = if ($isNumbered) { Remove-QuestionNumber $current.text } else { $current.text }
        $optionItems = [Collections.Generic.List[object]]::new()
        $cursor = $index + 1

        while ($cursor -lt $paragraphs.Count -and $optionItems.Count -lt 4) {
            $next = $paragraphs[$cursor]
            if (Test-IsNumberedQuestion $next.text) {
                break
            }
            if (-not $isNumbered -and $next.bold -and -not $next.underline) {
                break
            }

            $optionItems.Add($next)
            $cursor++
        }

        if ($optionItems.Count -ne 4) {
            $skipped.Add([pscustomobject]@{
                line = $current.line
                question = $questionText
                reason = "Không có đúng 4 lựa chọn"
                optionCount = $optionItems.Count
            })
            $index = [Math]::Max($index + 1, $cursor)
            continue
        }

        $correctIndexes = [Collections.Generic.List[int]]::new()
        for ($optionIndex = 0; $optionIndex -lt 4; $optionIndex++) {
            $option = $optionItems[$optionIndex]
            $isCorrect = if ($isNumbered) {
                $option.bold -or $option.underline
            }
            else {
                $option.underline
            }

            if ($isCorrect) {
                $correctIndexes.Add($optionIndex)
            }
        }

        if ($correctIndexes.Count -ne 1) {
            $skipped.Add([pscustomobject]@{
                line = $current.line
                question = $questionText
                reason = "Không xác định được duy nhất một đáp án đúng"
                markedAnswers = $correctIndexes.Count
            })
            $index = $cursor
            continue
        }

        $options = @($optionItems | ForEach-Object { Normalize-Text $_.text })
        if (($options | Where-Object { -not $_ }).Count -gt 0) {
            $skipped.Add([pscustomobject]@{
                line = $current.line
                question = $questionText
                reason = "Có lựa chọn rỗng"
            })
            $index = $cursor
            continue
        }

        $candidates.Add([pscustomobject]@{
            question = $questionText
            options = $options
            correctAnswer = $correctIndexes[0]
            topic = Get-Topic $questionText
            sourceLine = $current.line
            answerMarker = if ($isNumbered) { "bold" } else { "underline" }
        })
        $index = $cursor
    }

    $deduplicated = [Collections.Generic.List[object]]::new()
    $duplicates = [Collections.Generic.List[object]]::new()
    $seen = @{}

    foreach ($candidate in $candidates) {
        $key = Get-QuestionIdentityKey `
            -Question $candidate.question `
            -Options $candidate.options `
            -CorrectAnswer $candidate.correctAnswer
        if ($seen.ContainsKey($key)) {
            $existing = $seen[$key]
            $duplicates.Add([pscustomobject]@{
                question = $candidate.question
                firstSourceLine = $existing.sourceLine
                duplicateSourceLine = $candidate.sourceLine
                sameAnswer = $true
            })
            continue
        }

        $seen[$key] = $candidate
        $deduplicated.Add($candidate)
    }

    $questions = [Collections.Generic.List[object]]::new()
    $counter = 1
    foreach ($item in $deduplicated) {
        $questions.Add([ordered]@{
            id = "attt-{0:D3}" -f $counter
            topic = $item.topic
            question = $item.question
            options = $item.options
            correctAnswer = $item.correctAnswer
            explanation = ""
            source = [ordered]@{
                document = [IO.Path]::GetFileName($InputPath)
                line = $item.sourceLine
                marker = $item.answerMarker
            }
        })
        $counter++
    }

    $topicStats = @(
        $deduplicated |
            Group-Object topic |
            Sort-Object Count -Descending |
            ForEach-Object {
                [ordered]@{
                    topic = $_.Name
                    count = $_.Count
                }
            }
    )

    $report = [ordered]@{
        generatedAt = (Get-Date).ToString("o")
        input = $InputPath
        nonEmptyParagraphs = $paragraphs.Count
        acceptedBeforeDeduplication = $candidates.Count
        acceptedQuestions = $questions.Count
        skippedQuestions = $skipped.Count
        duplicatesRemoved = $duplicates.Count
        topics = $topicStats
        skipped = @($skipped)
        duplicates = @($duplicates)
    }

    $questions | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resolvedOutput -Encoding utf8
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resolvedReport -Encoding utf8

    Write-Host "Đã nhập $($questions.Count) câu hỏi hợp lệ."
    Write-Host "Loại $($duplicates.Count) câu trùng và bỏ qua $($skipped.Count) câu cần rà soát."
    $topicStats | Format-Table -AutoSize
}
finally {
    $archive.Dispose()
    $stream.Dispose()
}
