using System.Text.Json;

namespace Survey.Storage;

public sealed class FileSurveyRepository : ISurveyRepository, IDisposable
{
    private readonly string filePath;
    private readonly SemaphoreSlim gate = new(1, 1);

    public FileSurveyRepository(string filePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(filePath);
        this.filePath = Path.GetFullPath(filePath);
        Directory.CreateDirectory(Path.GetDirectoryName(this.filePath)!);
    }

    public async Task AddAsync(SurveyDocument survey, CancellationToken cancellationToken = default)
    {
        SurveyDocumentValidator.Validate(survey);
        await gate.WaitAsync(cancellationToken);
        try
        {
            await using FileStream lease = await AcquireFileLockAsync(cancellationToken);
            List<SurveyDocument> surveys = await ReadAsync(cancellationToken);
            if (surveys.Any(existing => existing.Id == survey.Id))
            {
                throw new InvalidDataException("同じIDのアンケートが既に存在します。");
            }
            surveys.Add(survey);
            string temporaryPath = $"{filePath}.{Guid.NewGuid():N}.tmp";
            try
            {
                await using (FileStream stream = new(temporaryPath, FileMode.CreateNew, FileAccess.Write,
                    FileShare.None, 4096, FileOptions.Asynchronous | FileOptions.WriteThrough))
                {
                    await JsonSerializer.SerializeAsync(stream, surveys, SurveyJson.Options, cancellationToken);
                    await stream.FlushAsync(cancellationToken);
                }
                cancellationToken.ThrowIfCancellationRequested();
                // 同じディレクトリ内の置換により、途中まで書いたJSONを公開しない。
                File.Move(temporaryPath, filePath, overwrite: true);
            }
            finally
            {
                File.Delete(temporaryPath);
            }
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task<IReadOnlyList<SurveyDocument>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            await using FileStream lease = await AcquireFileLockAsync(cancellationToken);
            return await ReadAsync(cancellationToken);
        }
        finally
        {
            gate.Release();
        }
    }

    private async Task<List<SurveyDocument>> ReadAsync(CancellationToken cancellationToken)
    {
        FileStream stream;
        try
        {
            stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read, 4096, FileOptions.Asynchronous);
        }
        catch (FileNotFoundException)
        {
            return [];
        }
        await using (stream)
        {
            List<SurveyDocument> surveys = await JsonSerializer.DeserializeAsync<List<SurveyDocument>>(
                stream, SurveyJson.Options, cancellationToken)
                ?? throw new InvalidDataException("アンケートファイルがnullです。");
            HashSet<string> ids = new(StringComparer.Ordinal);
            foreach (SurveyDocument? survey in surveys)
            {
                if (survey is null)
                {
                    throw new InvalidDataException("アンケートファイルにnullの回答が含まれています。");
                }
                SurveyDocumentValidator.Validate(survey);
                if (!ids.Add(survey.Id))
                {
                    throw new InvalidDataException("アンケートファイルに重複したIDが含まれています。");
                }
            }
            return surveys;
        }
    }

    private async Task<FileStream> AcquireFileLockAsync(CancellationToken cancellationToken)
    {
        long start = Environment.TickCount64;
        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                // 別ワーカープロセスからの同時更新も排他する。ロックファイル自体は削除しない。
                return new FileStream($"{filePath}.lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
            }
            catch (IOException exception) when (
                (exception.HResult & 0xffff) is 11 or 32 or 33 && Environment.TickCount64 - start < 10_000)
            {
                await Task.Delay(25, cancellationToken);
            }
        }
    }

    public void Dispose() => gate.Dispose();
}
