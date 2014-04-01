namespace BudgetAppWeb.Migrations
{
    using System;
    using System.Data.Entity.Migrations;
    
    public partial class Adddeleted : DbMigration
    {
        public override void Up()
        {
            AddColumn("dbo.Expenses", "IsDeleted", c => c.Boolean());
        }
        
        public override void Down()
        {
            DropColumn("dbo.Expenses", "IsDeleted");
        }
    }
}
