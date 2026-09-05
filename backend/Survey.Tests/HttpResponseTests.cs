using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Survey.Storage;

namespace Survey.Tests;

public sealed class HttpResponseTests
{
    [Fact]
    public async Task PostReturns201AndServerGeneratedId()
    {
        Mock<ISurveyRepository> repository = new();
        SurveyDocument? saved = null;
        repository.Setup(value => value.AddAsync(It.IsAny<SurveyDocument>(), It.IsAny<CancellationToken>()))
            .Callback<SurveyDocument, CancellationToken>((document, _) => saved = document)
            .Returns(Task.CompletedTask);
        HttpResponseData response = await Functions(repository.Object).CreateAsync(
            new TestHttpRequest(TestData.Json()), CancellationToken.None);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using JsonDocument json = await ReadResponseAsync(response);
        Assert.True(json.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("アンケートの登録が完了しました", json.RootElement.GetProperty("message").GetString());
        Assert.NotNull(saved);
        Assert.Equal(saved.Id, json.RootElement.GetProperty("surveyId").GetString());
        Assert.Equal("2026-09-05", saved.Date);
        Assert.Equal(3, json.RootElement.EnumerateObject().Count());
    }

    [Theory]
    [InlineData("{", 400, "INVALID_REQUEST")]
    [InlineData("null", 400, "INVALID_REQUEST")]
    [InlineData("[]", 400, "INVALID_REQUEST")]
    [InlineData("{}", 422, "VALIDATION_ERROR")]
    public async Task InvalidRequestReturnsContractAndDoesNotSave(string body, int status, string code)
    {
        Mock<ISurveyRepository> repository = new(MockBehavior.Strict);
        HttpResponseData response = await Functions(repository.Object).CreateAsync(
            new TestHttpRequest(body), CancellationToken.None);
        await AssertError(response, (HttpStatusCode)status, code);
        repository.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task EmptyGetReturnsCompleteResponseShape()
    {
        Mock<ISurveyRepository> repository = new();
        repository.Setup(value => value.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<SurveyDocument>());
        HttpResponseData response = await Functions(repository.Object).GetResultsAsync(
            new TestHttpRequest(), CancellationToken.None);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using JsonDocument json = await ReadResponseAsync(response);
        Assert.True(json.RootElement.GetProperty("success").GetBoolean());
        JsonElement data = json.RootElement.GetProperty("data");
        Assert.Equal(5, data.EnumerateObject().Count());
        Assert.Equal(0, data.GetProperty("totalResponses").GetInt32());
        Assert.Equal(3, data.GetProperty("communityAffiliation").EnumerateObject().Count());
        Assert.Equal(7, data.GetProperty("jobRole").EnumerateObject().Count());
        Assert.Equal(5, data.GetProperty("eventRating").GetProperty("distribution").EnumerateObject().Count());
        Assert.Equal(0, data.GetProperty("eventRating").GetProperty("average").GetDouble());
        Assert.Equal(0, data.GetProperty("feedback").GetArrayLength());
    }

    [Fact]
    public async Task FeedbackTimestampIsUtcIso8601()
    {
        Mock<ISurveyRepository> repository = new();
        repository.Setup(value => value.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { TestData.Document(feedback: "楽しかった") });
        HttpResponseData response = await Functions(repository.Object).GetResultsAsync(
            new TestHttpRequest(), CancellationToken.None);
        using JsonDocument json = await ReadResponseAsync(response);
        Assert.Equal("2026-09-05T23:59:59Z",
            json.RootElement.GetProperty("data").GetProperty("feedback")[0].GetProperty("timestamp").GetString());
    }

    [Fact]
    public async Task SaveFailureReturns500WithoutInternalDetails()
    {
        Mock<ISurveyRepository> repository = new();
        repository.Setup(value => value.AddAsync(It.IsAny<SurveyDocument>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new IOException("sensitive-detail"));
        HttpResponseData response = await Functions(repository.Object).CreateAsync(
            new TestHttpRequest(TestData.Json()), CancellationToken.None);
        await AssertError(response, HttpStatusCode.InternalServerError, "INTERNAL_SERVER_ERROR");
    }

    [Fact]
    public async Task ReadFailureReturns500RatherThanEmptyResults()
    {
        Mock<ISurveyRepository> repository = new();
        repository.Setup(value => value.GetAllAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidDataException("sensitive-detail"));
        HttpResponseData response = await Functions(repository.Object).GetResultsAsync(
            new TestHttpRequest(), CancellationToken.None);
        await AssertError(response, HttpStatusCode.InternalServerError, "INTERNAL_SERVER_ERROR");
    }

    private static SurveyFunctions Functions(ISurveyRepository repository) =>
        new(repository, new FixedClock(), NullLogger<SurveyFunctions>.Instance);

    private static async Task<JsonDocument> ReadResponseAsync(HttpResponseData response)
    {
        Assert.Equal("application/json; charset=utf-8", Assert.Single(response.Headers.GetValues("Content-Type")));
        Assert.Equal("no-store", Assert.Single(response.Headers.GetValues("Cache-Control")));
        response.Body.Position = 0;
        return await JsonDocument.ParseAsync(response.Body);
    }

    private static async Task AssertError(HttpResponseData response, HttpStatusCode status, string code)
    {
        Assert.Equal(status, response.StatusCode);
        using JsonDocument json = await ReadResponseAsync(response);
        Assert.False(json.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal(code, json.RootElement.GetProperty("code").GetString());
        Assert.NotEmpty(json.RootElement.GetProperty("error").GetString()!);
        Assert.DoesNotContain("sensitive-detail", json.RootElement.ToString());
        Assert.Equal(3, json.RootElement.EnumerateObject().Count());
    }
}
