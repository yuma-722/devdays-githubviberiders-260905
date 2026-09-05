using Microsoft.Azure.Cosmos;

namespace Survey.Storage;

public sealed class CosmosSurveyRepository(Container container) : ISurveyRepository
{
    public async Task AddAsync(SurveyDocument survey, CancellationToken cancellationToken = default)
    {
        SurveyDocumentValidator.Validate(survey);
        await container.CreateItemAsync(survey, new PartitionKey(survey.Date),
            cancellationToken: cancellationToken);
    }

    public async Task<IReadOnlyList<SurveyDocument>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        List<SurveyDocument> surveys = [];
        using FeedIterator<SurveyDocument> iterator =
            container.GetItemQueryIterator<SurveyDocument>(new QueryDefinition("SELECT * FROM c"));
        while (iterator.HasMoreResults)
        {
            FeedResponse<SurveyDocument> page = await iterator.ReadNextAsync(cancellationToken);
            foreach (SurveyDocument survey in page)
            {
                SurveyDocumentValidator.Validate(survey);
                surveys.Add(survey);
            }
        }
        return surveys;
    }
}
