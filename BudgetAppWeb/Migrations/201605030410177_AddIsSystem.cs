namespace BudgetAppWeb.Migrations
{
    using System;
    using System.Data.Entity.Migrations;
    
    public partial class AddIsSystem : DbMigration
    {
        public override void Up()
        {
            AddColumn("dbo.Expenses", "IsSystem", c => c.Boolean(nullable: true));
            
        }
        
        public override void Down()
        {
            DropColumn("dbo.Expenses", "IsSystem");
        }
    }
}
