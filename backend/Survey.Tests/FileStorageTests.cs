using System.Text.Json;
using System.Text.Json.Nodes;
using Survey.Storage;

namespace Survey.Tests;

public sealed class FileStorageTests : IDisposable
{
    private readonly string directory = Path.Combine(Path.GetTempPath(), $"survey-tests-{Guid.NewGuid():N}");
    private string FilePath => Path.Combine(directory, "surveys.json");

    [Fact]
    public async Task NewStorageIsEmptyAndPersistsAfterReopening()
    {
        SurveyDocument survey = TestData.Document();
        using (FileSurveyRepository repository = new(FilePath))
        {
            Assert.Empty(await repository.GetAllAsync());
            await repository.AddAsync(survey);
        }
        using FileSurveyRepository reopened = new(FilePath);
        SurveyDocument saved = Assert.Single(await reopened.GetAllAsync());
        Assert.Equal(survey.Id, saved.Id);
        Assert.Equal(survey.Date, saved.Date);
        Assert.Equal(survey.CreatedAt, saved.CreatedAt);
        using JsonDocument json = JsonDocument.Parse(await File.ReadAllTextAsync(FilePath));
        Assert.Equal(survey.Id, json.RootElement[0].GetProperty("id").GetString());
        Assert.Equal("2026-09-05", json.RootElement[0].GetProperty("date").GetString());
        Assert.Equal(8, json.RootElement[0].EnumerateObject().Count());
    }

    [Theory]
    [InlineData("[]")]
    [InlineData("[\"VS Code Meetup\", \"GitHub dockyard\"]")]
    [InlineData("[\"旧選択肢\"]")]
    [InlineData("null")]
    [InlineData("\"旧形式\"")]
    public async Task ReadsAndAggregatesLegacyRecordsWithoutRequiringMigration(string legacyValue)
    {
        SurveyDocument original = TestData.Document(4, "以前の回答");
        JsonNode document = JsonSerializer.SerializeToNode(original, SurveyJson.Options)!;
        document["communityAffiliation"] = JsonNode.Parse(legacyValue);
        string contents = new JsonArray(document).ToJsonString();
        using FileSurveyRepository repository = new(FilePath);
        await File.WriteAllTextAsync(FilePath, contents);

        IReadOnlyList<SurveyDocument> documents = await repository.GetAllAsync();
        SurveyDocument saved = Assert.Single(documents);
        Assert.Equal(original.Id, saved.Id);
        Assert.Equal(original.Date, saved.Date);
        Assert.Equal(original.CreatedAt, saved.CreatedAt);
        Assert.Equal(original.UpdatedAt, saved.UpdatedAt);
        SurveyResults results = SurveyAggregator.Aggregate(documents);
        Assert.Equal(1, results.TotalResponses);
        Assert.Equal(1, results.JobRole[SurveyOptions.JobRoles[0]]);
        Assert.Equal(4, results.EventRating.Average);
        Assert.Equal(original.Feedback, Assert.Single(results.Feedback).Feedback);
        Assert.Equal(contents, await File.ReadAllTextAsync(FilePath));

        await repository.AddAsync(TestData.Document());
        using JsonDocument json = JsonDocument.Parse(await File.ReadAllTextAsync(FilePath));
        Assert.Equal(2, json.RootElement.GetArrayLength());
        Assert.All(json.RootElement.EnumerateArray(),
            item => Assert.False(item.TryGetProperty("communityAffiliation", out _)));
        Assert.Equal(original.Id, json.RootElement[0].GetProperty("id").GetString());
    }

    [Fact]
    public async Task ConcurrentInstancesDoNotLoseWrites()
    {
        using FileSurveyRepository first = new(FilePath);
        using FileSurveyRepository second = new(FilePath);
        Task[] writes = Enumerable.Range(0, 32)
            .Select(index => (index % 2 == 0 ? first : second).AddAsync(TestData.Document())).ToArray();
        await Task.WhenAll(writes);
        IReadOnlyList<SurveyDocument> documents = await first.GetAllAsync();
        Assert.Equal(32, documents.Count);
        Assert.Equal(32, documents.Select(document => document.Id).Distinct().Count());
        Assert.Empty(Directory.GetFiles(directory, "*.tmp"));
    }

    [Theory]
    [InlineData("{")]
    [InlineData("null")]
    [InlineData("[null]")]
    [InlineData("[{}]")]
    [InlineData("")]
    public async Task CorruptionIsNotOverwritten(string contents)
    {
        using FileSurveyRepository repository = new(FilePath);
        await File.WriteAllTextAsync(FilePath, contents);
        Exception? readError = await Record.ExceptionAsync(() => repository.GetAllAsync());
        Assert.True(readError is JsonException or InvalidDataException);
        Exception? writeError = await Record.ExceptionAsync(() => repository.AddAsync(TestData.Document()));
        Assert.True(writeError is JsonException or InvalidDataException);
        Assert.Equal(contents, await File.ReadAllTextAsync(FilePath));
    }

    [Fact]
    public async Task DuplicateIdsFailWithoutChangingStoredData()
    {
        using FileSurveyRepository repository = new(FilePath);
        SurveyDocument document = TestData.Document();
        await repository.AddAsync(document);
        await Assert.ThrowsAsync<InvalidDataException>(() => repository.AddAsync(document));
        Assert.Single(await repository.GetAllAsync());
    }

    [Fact]
    public async Task CancellationDoesNotWriteAndDoesNotKeepTheLock()
    {
        using FileSurveyRepository repository = new(FilePath);
        using CancellationTokenSource source = new();
        await source.CancelAsync();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            repository.AddAsync(TestData.Document(), source.Token));
        await repository.AddAsync(TestData.Document());
        Assert.Single(await repository.GetAllAsync());
    }

    [Fact]
    public async Task ReadAccessFailureIsNotTreatedAsEmptyStorage()
    {
        using FileSurveyRepository repository = new(FilePath);
        Directory.CreateDirectory(FilePath);
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => repository.GetAllAsync());
    }

    public void Dispose()
    {
        if (Directory.Exists(directory))
        {
            Directory.Delete(directory, recursive: true);
        }
    }
}
