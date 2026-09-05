using System.Net;
using System.Text.Json;
using Azure.Identity;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;
using Survey.Storage;

namespace Survey;

public sealed class SurveyFunctions(
    ISurveyRepository repository,
    TimeProvider clock,
    ILogger<SurveyFunctions> logger)
{
    [Function("CreateSurvey")]
    public async Task<HttpResponseData> CreateAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "surveys")] HttpRequestData request,
        CancellationToken cancellationToken)
    {
        SurveyInput input;
        try
        {
            input = await SurveyRequestParser.ParseAsync(request.Body, cancellationToken);
        }
        catch (JsonException)
        {
            return await ErrorAsync(request, HttpStatusCode.BadRequest,
                "正しいJSONを指定してください。", "INVALID_REQUEST", cancellationToken);
        }
        catch (SurveyRequestException exception)
        {
            return await ErrorAsync(request, exception.StatusCode, exception.Message, exception.Code, cancellationToken);
        }

        SurveyDocument survey = SurveyDocument.Create(input, clock);
        try
        {
            await repository.AddAsync(survey, cancellationToken);
        }
        catch (Exception exception) when (IsStorageFailure(exception, cancellationToken))
        {
            // HTTP境界で障害を記録し、内部情報や入力本文をクライアントへ返さない。
            logger.LogError("アンケート保存に失敗しました。障害種別: {FailureType}", exception.GetType().Name);
            return await ErrorAsync(request, HttpStatusCode.InternalServerError,
                "アンケートの登録に失敗しました。", "INTERNAL_SERVER_ERROR", cancellationToken);
        }

        return await JsonAsync(request, HttpStatusCode.Created,
            new CreateSurveyResponse(true, "アンケートの登録が完了しました", survey.Id), cancellationToken);
    }

    [Function("GetSurveyResults")]
    public async Task<HttpResponseData> GetResultsAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "surveys/results")] HttpRequestData request,
        CancellationToken cancellationToken)
    {
        SurveyResults results;
        try
        {
            IReadOnlyList<SurveyDocument> surveys = await repository.GetAllAsync(cancellationToken);
            results = SurveyAggregator.Aggregate(surveys);
        }
        catch (Exception exception) when (IsStorageFailure(exception, cancellationToken))
        {
            logger.LogError("アンケート集計に失敗しました。障害種別: {FailureType}", exception.GetType().Name);
            return await ErrorAsync(request, HttpStatusCode.InternalServerError,
                "集計結果の取得に失敗しました。", "INTERNAL_SERVER_ERROR", cancellationToken);
        }

        return await JsonAsync(request, HttpStatusCode.OK, new SurveyResultsResponse(true, results), cancellationToken);
    }

    private static Task<HttpResponseData> ErrorAsync(
        HttpRequestData request, HttpStatusCode status, string message, string code, CancellationToken cancellationToken)
        => JsonAsync(request, status, new ApiError(false, message, code), cancellationToken);

    private static bool IsStorageFailure(Exception exception, CancellationToken cancellationToken) =>
        exception is CosmosException or IOException or InvalidDataException or UnauthorizedAccessException or JsonException
            or AuthenticationFailedException or HttpRequestException or InvalidOperationException or TimeoutException
        || (exception is OperationCanceledException && !cancellationToken.IsCancellationRequested);

    private static async Task<HttpResponseData> JsonAsync<T>(
        HttpRequestData request, HttpStatusCode status, T payload, CancellationToken cancellationToken)
    {
        HttpResponseData response = request.CreateResponse(status);
        response.Headers.Add("Content-Type", "application/json; charset=utf-8");
        response.Headers.Add("Cache-Control", "no-store");
        await JsonSerializer.SerializeAsync(response.Body, payload, SurveyJson.Options, cancellationToken);
        return response;
    }
}
